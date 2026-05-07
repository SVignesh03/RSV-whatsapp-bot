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
      },
      { timestamps: true },
    ),
    "Payment",
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
      console.log("WhatsApp is connected!");
      const today = moment().startOf("day").toDate();
      const sevenDaysFromNow = moment().add(7, "days").endOf("day").toDate();
      const expiringSoon = await Payment.find({
        dueDate: {
          $gte: today,
          $lte: sevenDaysFromNow,
        },
        paymentStatus: { $ne: "paid" },
      }).populate("memberId");
      console.log(
        `Found ${expiringSoon.length} expiring soon payments to remind!`,
      );

      for (const payment of expiringSoon) {
        const member = payment.memberId;

        if (!member || !member.phone) {
          console.log(
            `Member ${member?.name || "Unknown"} has no phone number! Skipping...`,
          );
          continue;
        }

        const daysRemaining = moment(payment.dueDate)
          .startOf("day")
          .diff(moment().startOf("day"), "days");

        if ([7, 3, 0].includes(daysRemaining)) {
          const cleanPhone = member.phone.replace(/\D/g, "");
          const jid = `${cleanPhone}@s.whatsapp.net`;
          const timeLabel =
            daysRemaining === 0 ? "Today" : `in ${daysRemaining} days`;
          const message = `Hi ${member.name}, your ${payment.planName || "Membership"} expires ${timeLabel}. Don't miss your workout! Please ignore if already renewed.`;

          try {
            await sock.sendMessage(jid, { text: message });
            console.log(`Sent reminder to ${member.name} (${member.phone})`);
          } catch (e) {
            console.error(`Error sending message to ${member.name}`, e);
          }
          const randomdelay = Math.floor(Math.random() * 15001) + 15000;
          await delay(randomdelay);
        }
      }
      console.log("Done!");
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
