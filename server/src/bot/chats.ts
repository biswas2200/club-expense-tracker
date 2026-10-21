import { isValidObjectId, type Types } from 'mongoose';
import type { BotMessageDTO, ChatKind } from '@nocap/shared';
import { BotMessage, type BotMessageFields } from '../models/BotMessage';
import { namesFor, personRef } from '../services/people';

/**
 * Chat ids. v0.3 has one class group and a private chat with each person; v0.6 maps these to
 * WhatsApp chats (a group id and each member's phone number).
 */
export const GROUP_CHAT_ID = 'group-sparks';
export const GROUP_CHAT_TITLE = 'Sparks class group';
export const privateChatId = (memberId: Types.ObjectId | string) => `dm-${String(memberId)}`;

/** The kind of chat and, for a private chat, whose it is. undefined: not a chat id we know. */
export function parseChatId(chatId: string): { kind: ChatKind; memberId?: string } | undefined {
  if (chatId === GROUP_CHAT_ID) return { kind: 'group' };
  const memberId = /^dm-(.+)$/.exec(chatId)?.[1];
  return memberId && isValidObjectId(memberId) ? { kind: 'private', memberId } : undefined;
}

/** The bot writes a message into a chat. */
export async function say(chatId: string, text: string) {
  return BotMessage.create({ chatId, from: 'bot', text });
}

type StoredMessage = BotMessageFields & { _id: Types.ObjectId; createdAt: Date };

export async function threadDTOs(chatId: string): Promise<BotMessageDTO[]> {
  const messages = (await BotMessage.find({ chatId })
    .sort({ createdAt: 1, _id: 1 })
    .lean()) as StoredMessage[];
  const names = await namesFor(messages.map((m) => m.senderId));
  return messages.map((m) => ({
    id: String(m._id),
    chatId: m.chatId,
    from: m.from,
    sender: personRef(names, m.senderId),
    text: m.text ?? undefined,
    imageUrl: m.imagePath ? `/api/proofs/${m.imagePath}` : undefined,
    createdAt: m.createdAt.toISOString(),
  }));
}
