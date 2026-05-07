require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
} = require("@whiskeysockets/baileys");
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

const mobile = "+91 6369343481";

async function run() {
  await setupAuth();
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["RSV Bot", "Chrome", "1.0.0"],
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;
    if (connection === "open") {
      console.log("WhatsApp is connected!");
      const cleanPhone = mobile.replace(/\D/g, "");
      const jid = `${cleanPhone}@s.whatsapp.net`;
      const message = "Hello from RSV Bot!";
      await sock.sendMessage(jid, { text: message });
      await delay(10000);
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
