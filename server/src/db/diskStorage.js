import fs from 'node:fs';
import path from 'node:path';

/**
 * File storage on local disk. Bytes live in `<uploadDir>/<fileId>` (never under a user-supplied name, so
 * path tricks are impossible); the record in MongoDB keeps the name, type and size. The URL points at the
 * authenticated download route, never at the folder. To use S3 / GridFS instead, implement the same
 * three methods and pass it to `setStorage`.
 */
export function createDiskStorage(uploadDir) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const pathFor = (id) => {
    if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Invalid file id');
    return path.join(uploadDir, id);
  };
  return {
    async put(file, id) {
      if (!file.buffer) throw new Error('No file data received.');
      await fs.promises.writeFile(pathFor(id), file.buffer, { flag: 'wx' });
      return `/api/files/${id}/content`;
    },
    async remove(record) {
      if (record?.id) await fs.promises.rm(pathFor(record.id), { force: true });
    },
    read(record) {
      return fs.createReadStream(pathFor(record.id));
    },
  };
}
