import { createNuxtApiHandler } from 'trpc-nuxt'
import { publicProcedure, router } from '~/server/trpc/trpc'
import { z } from 'zod'
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';


const ee = new EventEmitter();
const onlineUsers: any[] = [];

export const appRouter = router({
  onMessage: publicProcedure
  .input(
    z.object({
      id: z.string()
    })
  )
  .subscription(({ input }) => {
    return observable<any>((emit) => {
      const onMessage = (data: any) => {
        if (input.id === data.to) {
          emit.next(data.message);
        }
      };
      
      ee.on('message', onMessage);

      return () => {
        ee.off('message', onMessage);
      };
    });
  }),
  sendMessage: publicProcedure
    .input(
      z.object({
        message: z.object({
            id: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
            conversationId: z.string(),
            senderId: z.string(),
            text: z.string(),
            seen: z.array(z.string())
          }),
          to: z.string(),
      }),
    )
    .query(({ input }) => {
      ee.emit('message', input);

      return input
    }),
    onTyping: publicProcedure
    .input(
      z.object({
        id:z.string()
      })
    )
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const onTyping = (data: any) => {
          if (input.id === data.data.to) {
            emit.next(data.data.conversationId);
          }
        };
        
        ee.on('typing', onTyping);
  
        return () => {
          ee.off('typing', onTyping);
        };
      });
    }),
    typing: publicProcedure
    .input(
      z.object({
        data: z.object({
            to: z.string(),
            conversationId: z.string(),
          }),
      }),
    )
    .query(({ input }) => {
      ee.emit('typing', input);

      return input
    }),
    getOnlineUsers:publicProcedure
    .query(() => {
      return onlineUsers
    }),
    onOnlineUsers:publicProcedure
    .subscription(() => {
      return observable<any[]>((emit) => {
        const handler = () => emit.next(onlineUsers);
        ee.on('online-users', handler);
        
        return () => {
          ee.off('online-users', handler);
        };
      });
    }),
    setOnline:publicProcedure
    .input(z.string())
    .mutation(({ input:userId }) => {
      console.log(userId)
      const user = onlineUsers.find((id) => id === userId);
      if (!user) {
        onlineUsers.push(userId);
        ee.emit('online-users');
      }
      return userId;
    }),
    setOffline:publicProcedure
    .input(z.string())
    .mutation(({ input:userId }) => {
      console.log(userId)
      console.log(onlineUsers)
      const index = onlineUsers.findIndex((user) => user.id === userId);
      if (index !== -1) {
        onlineUsers.splice(index, 1);
        ee.emit('online-users');
      }
      return userId;
    })
});

export type AppRouter = typeof appRouter;

export default createNuxtApiHandler({
  router: appRouter,
  createContext: () => ({}),
})