import { acceptHMRUpdate, defineStore } from 'pinia';
import type { Message } from '~/types';

export const useMessageStore = defineStore({
    id: 'message',
    state: (): Message => ({
        id: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        conversationId: '',
        senderId: '',
        text: '',
        seen: [],
    }),

    actions: {
       addToreply(message:Message){
        this.$patch({...message,reply:true});
       },
       addToEdit(message:Message){
        this.$patch({...message,edit:true});
        console.log(this.$state)
       },
       addToDelete(message:Message){
        this.$patch({...message,delete:true});
        console.log(this.$state)
       },
       clear() {
        this.$state = {
            id: '',
            createdAt: new Date(),
            updatedAt: new Date(),
            conversationId: '',
            senderId: '',
            text: '',
            seen: [],
            edit:false,
            reply:false,
            delete:false
        };
    },
    },

});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useMessageStore, import.meta.hot));
}
