const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

app.post('/sms', (req, res) => {
    const { id, sender, content, timestamp } = req.body;

    if (!id || !sender) {
        return res.status(400).send('Missing fields');
    }

    const logMessage = `[${new Date(timestamp).toLocaleString()}] FROM: ${sender} | CONTENT: ${content}\n`;
    const filePath = path.join(dataDir, `${id}.log`);

    fs.appendFile(filePath, logMessage, (err) => {
        if (err) {
            console.error('Error writing to file:', err);
            return res.status(500).send('Server Error');
        }
        console.log(`Log saved for ID: ${id}`);
        res.status(200).send('Received');
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Listening for SMS data at /sms`);
});

