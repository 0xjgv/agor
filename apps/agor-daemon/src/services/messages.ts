/**
 * Messages Service
 *
 * Provides REST + WebSocket API for message management.
 * Uses DrizzleService adapter with MessagesRepository.
 */

import { type Database, MessagesRepository } from '@agor/core/db';
import type { Message, SessionID, TaskID } from '@agor/core/types';
import type { Params } from '@feathersjs/feathers';
import { DrizzleService } from '../adapters/drizzle';

/**
 * Message service params
 */
export interface MessageParams extends Params {
  query?: {
    session_id?: SessionID;
    task_id?: TaskID;
    type?: Message['type'];
    role?: Message['role'];
    $limit?: number;
    $skip?: number;
    $sort?: Record<string, 1 | -1>;
    $select?: string[];
  };
}

/**
 * Extended messages service with custom methods
 */
export class MessagesService extends DrizzleService<Message, Partial<Message>, MessageParams> {
  private messagesRepo: MessagesRepository;

  constructor(db: Database) {
    const messagesRepo = new MessagesRepository(db);
    super(messagesRepo, {
      id: 'message_id',
      paginate: {
        default: 100,
        max: 1000, // Allow larger page size for bulk message retrieval
      },
      multi: ['create', 'remove'], // Allow bulk creates and removes
    });

    this.messagesRepo = messagesRepo;
  }

  /**
   * Custom method: Get messages by session
   */
  async findBySession(sessionId: SessionID): Promise<Message[]> {
    return this.messagesRepo.findBySessionId(sessionId);
  }

  /**
   * Custom method: Get messages by task
   */
  async findByTask(taskId: TaskID): Promise<Message[]> {
    return this.messagesRepo.findByTaskId(taskId);
  }

  /**
   * Custom method: Get messages in a range
   */
  async findByRange(
    sessionId: SessionID,
    startIndex: number,
    endIndex: number
  ): Promise<Message[]> {
    return this.messagesRepo.findByRange(sessionId, startIndex, endIndex);
  }

  /**
   * Custom method: Bulk insert messages
   */
  async createMany(messages: Message[]): Promise<Message[]> {
    return this.messagesRepo.createMany(messages);
  }
}

/**
 * Service factory function
 */
export function createMessagesService(db: Database): MessagesService {
  return new MessagesService(db);
}
