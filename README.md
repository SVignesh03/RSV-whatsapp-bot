# RSV Fitness Studio - WhatsApp Reminder Bot 🏋️‍♂️

An automated WhatsApp reminder system for **RSV Fitness Studio (Tirunelveli Branch)**. This bot syncs with a MongoDB database to identify members whose memberships are expiring or overdue and sends automated reminders via WhatsApp.

## 🚀 Features

- **Automated Sync**: Fetches member data directly from the RSV Fitness Studio production database.
- **Synced Logic**: Matches the main dashboard's expiration logic (7 days future, 10 days past).
- **Intelligent Reminders**: Automatically calculates `daysLeft` and categorizes members as *Expiring Today*, *Upcoming*, or *Overdue*.
- **Anti-Ban Protection**: Uses randomized delays (15–25 seconds) between messages to mimic human behavior and avoid WhatsApp spam flags.
- **Headless Execution**: Designed to run as a GitHub Action via a scheduled cron job.

## 🛠 Tech Stack

- **Node.js**: Runtime environment.
- **Baileys**: High-performance WhatsApp Web API library.
- **Mongoose**: MongoDB object modeling.
- **Moment.js**: Date manipulation and time-zone handling.
- **GitHub Actions**: Automated daily scheduling.

## ⚙️ Setup & Configuration

### 1. Environment Variables
The bot requires the following environment variables to be set (either in a `.env` file for local testing or in GitHub Secrets for production):

| Variable | Description |
| :--- | :--- |
| `MONGODB_URI` | The full connection string to your MongoDB cluster (e.g., `.../Gym`). |
| `SESSION_DATA` | The Base64 encoded authentication string for the WhatsApp session. |

### 2. Local Installation
```bash
# Clone the repository
git clone https://github.com/SVignesh03/RSV-whatsapp-bot.git

# Install dependencies
npm install

# Run the bot manually
node index.js
