require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
} = require("@whiskeysockets/baileys");
const mongoose = require("mongoose");
const moment = require("moment");
const fs = require("fs");

async function setupAuth() {
  if (!fs.existsSync("./auth_info")) fs.mkdirSync("./auth_info");
  if (process.env.SESSION_DATA) {
    const credsJson = Buffer.from(process.env.SESSION_DATA, "base64").toString(
      "utf-8",
    );
    fs.writeFileSync("./auth_info/creds.json", credsJson);
  } else {
    console.error("Please provide SESSION_DATA environment variable.");
    process.exit(1);
  }
}

const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    new mongoose.Schema(
      {
        name: { type: String, required: true },
        phone: { type: String },
        role: { type: String },
        admissionNumber: {
          type: String,
          sparse: true,
          unique: true,
          trim: true,
        },
      },
      { timestamps: true },
    ),
    "User",
  );

const Payment =
  mongoose.models.Payment ||
  mongoose.model(
    "Payment",
    new mongoose.Schema(
      {
        memberId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        paymentStatus: { type: String, default: "pending" },
        dueDate: { type: Date },
        planName: { type: String },
        balanceAmount: { type: Number },
      },
      { timestamps: true },
    ),
    "payments",
  );

async function run() {
  await setupAuth();
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["RSV Bot", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;
    if (connection === "open") {
      console.log("✅ WhatsApp Connected! Preparing to send reminders...");

      const today = moment().startOf("day");
      const sevenDaysFromNow = moment().add(7, "days").endOf("day").toDate();

      try {
        const rawPayments = await Payment.aggregate([
          { $sort: { dueDate: -1 } },
          {
            $group: {
              _id: "$memberId",
              latestPayment: { $first: "$$ROOT" },           
            }
          },
          { $replaceRoot: { newRoot: "$latestPayment" } },
          {
            $lookup: {
              from: "User",
              localField: "memberId",
              foreignField: "_id",
              as: "memberId",
            },
          },
          {
            $unwind: {
              path: "$memberId",
              preserveNullAndEmptyArrays: true,
            },
          },
        ]);

        const dashboardMembers = rawPayments.filter((p) => {
          if (!p.dueDate || !p.memberId?.phone) return false;
          const daysLeft = moment(p.dueDate).startOf("day").diff(today, "days");
          return daysLeft <= 7 && daysLeft >= -10;
        });

        console.log(`🚀 Found ${dashboardMembers.length} members to notify.`);

        for (const [index, p] of dashboardMembers.entries()) {
          const m = p.memberId;
          const daysLeft = moment(p.dueDate).startOf("day").diff(today, "days");

          const cleanPhone = m.phone.replace(/\D/g, "");
          const jid = `${cleanPhone}@s.whatsapp.net`;

          let timeLabel = "";
          if (daysLeft === 0) timeLabel = "*Today*";
          else if (daysLeft > 0) timeLabel = `in *${daysLeft} days*`;
          else timeLabel = `*${Math.abs(daysLeft)} days ago*`;

          const statusWord = daysLeft < 0 ? "expired" : "expires";

          const message = `*RSV Fitness Studio Reminder* 🏋️‍♂️\n\nHi *${m.name}*,\n\nYour gym membership ${statusWord} ${timeLabel} (${moment(p.dueDate).format("DD MMM")}).\n\nTo ensure your workout routine is not interrupted, please visit the front desk for renewal.\n\n_ID: #${m.admissionNumber || "N/A"}_\n_Please ignore if already paid._`;

          try {
            console.log(
              `[${index + 1}/${dashboardMembers.length}] Sending to ${m.name}...`,
            );

            await sock.sendMessage(jid, { text: message });

            console.log(`✅ Message delivered to ${m.name} (${m.admissionNumber}).`);

            const waitTime = Math.floor(Math.random() * 15001) + 15000;
            if (index < dashboardMembers.length - 1) {
              console.log(`⏳ Waiting ${waitTime / 1000}s for next message...`);
              await delay(waitTime);
            }
          } catch (sendError) {
            console.error(`❌ Failed for ${m.name}:`, sendError.message);
          }
        }

        console.log("\n✅ ALL REMINDERS PROCESSED SUCCESSFULLY!");
      } catch (err) {
        console.error("❌ CRITICAL ERROR:", err);
      }

      await delay(5000);
      process.exit(0);
    }
    if (connection === "close") {
      console.log("WhatsApp is disconnected!");
      const code = update.lastDisconnect?.error?.output?.statusCode;
      if (code === 401) {
        console.error("❌ Session Expired! Update your GitHub Secret.");
        process.exit(1);
      }
      process.exit(1);
    }
  });
}

run();
