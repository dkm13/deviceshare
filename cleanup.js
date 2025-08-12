const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_AGE_MS = 1 * 60 * 60 * 1000;  // 1 hour in milliseconds

function startCleanupJob() {
  // Schedule to run every hour at minute 0
  cron.schedule('0 * * * *', () => {
    console.log(`[Cleanup] Running cleanup at ${new Date().toLocaleString()}`);

    fs.readdir(UPLOAD_DIR, (err, files) => {
      if (err) {
        console.error(`[Cleanup] Failed to read directory: ${err.message}`);
        return;
      }

      files.forEach(file => {
        const filePath = path.join(UPLOAD_DIR, file);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.error(`[Cleanup] Failed to get stats for ${file}: ${err.message}`);
            return;
          }

          const age = Date.now() - stats.mtimeMs;
          if (age > MAX_FILE_AGE_MS) {
            fs.unlink(filePath, err => {
              if (err) {
                console.error(`[Cleanup] Failed to delete ${file}: ${err.message}`);
              } else {
                console.log(`[Cleanup] Deleted old file: ${file}`);
              }
            });
          }
        });
      });
    });
  });
}

module.exports = { startCleanupJob };
