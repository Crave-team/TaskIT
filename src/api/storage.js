/**
 * File storage adapter. The browser demo keeps uploads as temporary object URLs; the Node server
 * plugs in disk (or S3/GridFS) storage with `setStorage`. The services only ever call
 * `put` / `remove` / (for downloads) `read`, all async.
 *
 *   put(file, id)   -> url the file can be fetched from.  `file` is a browser File/Blob or, on the
 *                      server, `{ name, size, type, buffer }`.
 *   remove(record)  -> deletes the stored bytes of a file record ({ id, url }).
 *   read(record)    -> (server only) { stream | buffer } for downloads.
 */
const canBlob = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined';

const memoryStorage = {
  async put(file, id) {
    if (canBlob && file instanceof Blob) return URL.createObjectURL(file);
    return `memory://files/${id}`;
  },
  async remove(record) {
    const url = record?.url;
    if (canBlob && url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  },
};

let impl = memoryStorage;
export const setStorage = (next) => { impl = next; };

export const storage = {
  put: (file, id) => impl.put(file, id),
  remove: (record) => impl.remove(record),
  read: (record) => impl.read(record),
};
