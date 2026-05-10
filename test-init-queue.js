const fs = require('fs');
const content = fs.readFileSync('e:/code/ceru-backend/src/listen-together/room.service.ts', 'utf-8');
const lines = content.split('\n');
console.log(lines.find(l => l.includes('createRoom')));
