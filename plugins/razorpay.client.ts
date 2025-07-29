export default defineNuxtPlugin(() => {
  return {
    provide: {
      razorpay: {
        async load() {
          if (typeof window !== 'undefined' && !(window as any).Razorpay) {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://checkout.razorpay.com/v1/checkout.js';
              script.onload = () => resolve();
              script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
              document.head.appendChild(script);
            });
          }
        },
      },
    },
  };
});
