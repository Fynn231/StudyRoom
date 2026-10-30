import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
// Deterministic stored ZIP, no external packaging dependency or generated keys.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
const names = readdirSync("extension")
  .filter((n) => /^[a-zA-Z0-9.-]+$/.test(n))
  .sort();
for (const filename of names) {
  const name = Buffer.from(filename),
    data = readFileSync("extension/" + filename),
    crc = crc32(data),
    head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(33, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(data.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, data);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(33, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += head.length + name.length + data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
mkdirSync("public/downloads", { recursive: true });
writeFileSync(
  "public/downloads/studyroom-focus-extension.zip",
  Buffer.concat([...local, directory, end]),
);
