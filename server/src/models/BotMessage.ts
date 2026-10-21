import { model, Schema, type InferSchemaType } from 'mongoose';
import { makeAppendOnly } from '../lib/appendOnly';

/**
 * Every message in and out of the bot. In v0.3 the chat simulator reads these threads; from
 * v0.6 the WhatsApp relay also delivers the bot's messages from here. Not part of the ledger.
 */
const botMessageSchema = new Schema(
  {
    chatId: { type: String, required: true, maxlength: 80 },
    from: { type: String, enum: ['person', 'bot'], required: true },
    /** The registered person who wrote it; unset for the bot and for unknown numbers. */
    senderId: { type: Schema.Types.ObjectId, ref: 'Member' },
    text: { type: String, maxlength: 4000 },
    /** File name of a screenshot or photo in the upload folder. */
    imagePath: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

botMessageSchema.index({ chatId: 1, createdAt: 1, _id: 1 });

makeAppendOnly(botMessageSchema, 'Bot messages', 'a chat is a record of what was said');

export type BotMessageFields = InferSchemaType<typeof botMessageSchema>;

export const BotMessage = model('BotMessage', botMessageSchema, 'bot_messages');
