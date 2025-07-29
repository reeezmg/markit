export async function useFindCategory(id: string) {
    try {
      // Using $fetch for client-side fetching
      const category = await $fetch(`/api/gettax/`);
      
      return { data: category, pending: false, error: null, refresh: null };
    } catch (error) {
      return { data: null, pending: false, error, refresh: null };
    }
  }
  