import { defineNuxtPlugin } from '#app';
import VueTelInput from 'vue-tel-input';

import "/node_modules/vue-tel-input/dist/vue-tel-input.css";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VueTelInput as any);
});
