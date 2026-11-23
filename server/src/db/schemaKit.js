import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Small helpers shared by the schema files. Design choices (same as models.js):
 *  - `_id` is the 24-hex STRING our data layer generates, and every reference is the same kind of string.
 *  - `strict: 'throw'`: writing a field a schema does not declare is an error, not silent data loss.
 */
export const base = { versionKey: false, minimize: false, strict: 'throw' };
export const str = (extra = {}) => ({ type: String, ...extra });
export const ref = (extra = {}) => ({ type: String, default: null, index: true, ...extra });

/** Registers (or reuses) a model whose collection name and indexes are given explicitly. */
export const make = (name, collection, definition, indexes = [], configure = () => {}) => {
  const schema = new Schema({ _id: String, ...definition }, { ...base, collection });
  indexes.forEach(([fields, options]) => schema.index(fields, options));
  configure(schema);
  return mongoose.models[name] || mongoose.model(name, schema);
};

const BLOCKED_WRITES = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'findOneAndDelete', 'deleteOne', 'deleteMany',
];

/**
 * Makes a collection append-only at the Mongoose level: every update or replace is refused, and so is every delete
 * unless the caller passes the explicit `{ purge: true }` option (used only when a whole organization or account is
 * removed). This guards code that goes through these models; it cannot stop someone with direct database access.
 */
export function appendOnly(schema) {
  schema.pre(BLOCKED_WRITES, function guard() {
    const isDelete = /delete/i.test(this.op);
    if (isDelete && this.getOptions().purge === true) return;
    throw new Error(`${this.model.modelName} is append-only: "${this.op}" is not allowed.`);
  });
  schema.pre('save', function guardSave() {
    if (!this.isNew) throw new Error(`${this.constructor.modelName} is append-only: existing rows cannot be saved again.`);
  });
}
