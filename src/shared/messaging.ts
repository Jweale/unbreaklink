export const sendMessage = <TRequest extends Record<string, unknown>, TResponse>(
  message: TRequest
): Promise<TResponse> =>
  new Promise<TResponse>((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response: TResponse) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error as Error);
    }
  });

export const addMessageListener = (
  listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0]
) => {
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
};

export const invokeBackgroundFunction = async <TArgs extends unknown[], TResult>(
  action: string,
  ...args: TArgs
): Promise<TResult> =>
  sendMessage<{ type: string; payload: unknown }, TResult>({ type: action, payload: args });

export type MessageCallback<TPayload = unknown, TResult = void> = (
  payload: TPayload,
  sender: chrome.runtime.MessageSender
) => TResult | Promise<TResult>;

export const registerMessageHandler = <TPayload = unknown, TResult = void>(
  type: string,
  callback: MessageCallback<TPayload, TResult>
) =>
  addMessageListener((message, sender, sendResponse) => {
    if (typeof message !== 'object' || message === null) {
      return;
    }
    if (message.type !== type) {
      return;
    }

    Promise.resolve(callback(message.payload as TPayload, sender))
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: Error) => {
        sendResponse({ error: error.message });
      });

    return true;
  });
