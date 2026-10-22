/** Native Responses for ZenStack, with the current SSR session kept on this app's model API. */
export function createModelRequestFetch(options: {
  endpoint: string; requestURL: string; cookie?: string; fetcher?: typeof globalThis.fetch;
}): typeof globalThis.fetch {
  const origin = new URL(options.requestURL).origin;
  const modelPath = new URL(options.endpoint, options.requestURL).pathname.replace(/\/+$/, '');
  const fetcher = options.fetcher || globalThis.fetch.bind(globalThis);
  return (input, init = {}) => {
    const request = input instanceof Request;
    const target = new URL(request ? input.url : String(input), options.requestURL);
    const headers = new Headers(request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const credentials = init.credentials ?? (request ? input.credentials : 'include');
    if (options.cookie && credentials !== 'omit' && target.origin === origin &&
        (target.pathname === modelPath || target.pathname.startsWith(modelPath + '/'))) {
      headers.set('cookie', options.cookie);
    }
    return fetcher(request ? input : target, { ...init, credentials, headers });
  };
}
