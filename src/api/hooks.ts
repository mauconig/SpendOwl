import { useAuth } from '@clerk/expo';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createApi } from './client';
import type {
  ApiCreditCard,
  ApiInsights,
  ApiMessage,
  ApiMessageKind,
  ApiReceipt,
  ApiSettings,
  ApiSubscription,
  ApiSummary,
  ApiTransaction,
} from './types';

export const keys = {
  transactions: ['transactions'] as const,
  summary: ['summary'] as const,
  cards: ['credit-cards'] as const,
  subscriptions: ['subscriptions'] as const,
  receipts: ['receipts'] as const,
  messages: ['messages'] as const,
  settings: ['settings'] as const,
  insights: ['insights'] as const,
};

function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApi(getToken), [getToken]);
}

// Anything that changes money must also refresh the derived summary — the
// hero number, donut and trend chart all come from it.
function invalidateMoney(client: QueryClient) {
  void client.invalidateQueries({ queryKey: keys.summary });
}

export function useTransactions() {
  const api = useApi();
  return useQuery({ queryKey: keys.transactions, queryFn: () => api.get<ApiTransaction[]>('/api/transactions') });
}

export function useSummary() {
  const api = useApi();
  return useQuery({ queryKey: keys.summary, queryFn: () => api.get<ApiSummary>('/api/summary') });
}

export function useCreditCards() {
  const api = useApi();
  return useQuery({ queryKey: keys.cards, queryFn: () => api.get<ApiCreditCard[]>('/api/credit-cards') });
}

export function useSubscriptions() {
  const api = useApi();
  return useQuery({ queryKey: keys.subscriptions, queryFn: () => api.get<ApiSubscription[]>('/api/subscriptions') });
}

export function useReceipts() {
  const api = useApi();
  return useQuery({ queryKey: keys.receipts, queryFn: () => api.get<ApiReceipt[]>('/api/receipts') });
}

export function useMessages() {
  const api = useApi();
  return useQuery({ queryKey: keys.messages, queryFn: () => api.get<ApiMessage[]>('/api/messages') });
}

/**
 * The Home screen's daily cards. A pure cache read on the server, so this is
 * fast and never blocks on a model — if the set is stale, `stale: true` comes
 * back and the provider fires useRefreshInsights() behind the already-rendered
 * fallback cards.
 */
export function useInsights() {
  const api = useApi();
  return useQuery({ queryKey: keys.insights, queryFn: () => api.get<ApiInsights>('/api/insights') });
}

/**
 * The one call that can spend money. It is a no-op server-side when today's
 * cards already exist, which is what caps it at one model call per user per day.
 * Failures are deliberately unhandled here: the Home screen falls back to its
 * rule-based cards, so there is nothing to tell the user about.
 */
export function useRefreshInsights() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApiInsights>('/api/insights/refresh'),
    onSuccess: data => client.setQueryData(keys.insights, data),
  });
}

export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: keys.settings, queryFn: () => api.get<ApiSettings>('/api/settings') });
}

export function useAddTransaction() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      merchant: string;
      category: string;
      amountMinor: number;
      note?: string | null;
      taxDeductible?: boolean;
    }) => api.post<ApiTransaction>('/api/transactions', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.transactions });
      invalidateMoney(client);
    },
  });
}

export function useUpdateTransaction() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      merchant?: string;
      category?: string;
      amountMinor?: number;
      occurredAt?: string;
      note?: string | null;
      taxDeductible?: boolean;
    }) => api.patch<ApiTransaction>(`/api/transactions/${id}`, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.transactions });
      invalidateMoney(client);
    },
  });
}

/**
 * Optimistic, like the other removals: the row should go the moment it is
 * confirmed rather than after a round trip. The money summary is invalidated
 * too — deleting a transaction moves the hero number and the donut.
 */
export function useDeleteTransaction() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/transactions/${id}`),
    onMutate: async id => {
      await client.cancelQueries({ queryKey: keys.transactions });
      const previous = client.getQueryData<ApiTransaction[]>(keys.transactions);
      client.setQueryData<ApiTransaction[]>(keys.transactions, current => current?.filter(t => t.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(keys.transactions, context.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.transactions });
      invalidateMoney(client);
    },
  });
}

export function useAddCreditCard() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      balanceMinor: number;
      limitMinor: number;
      apr: number;
      color: string;
    }) => api.post<ApiCreditCard>('/api/credit-cards', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.cards }),
  });
}

export function useRemoveCreditCard() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/credit-cards/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.cards }),
  });
}

export function usePayoffCreditCard() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountMinor }: { id: string; amountMinor: number }) =>
      api.post<ApiCreditCard>(`/api/credit-cards/${id}/payoff`, { amountMinor }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.cards }),
  });
}

/** The opposite of payoff: buying on a card adds to what is owed. */
export function useChargeCreditCard() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountMinor }: { id: string; amountMinor: number }) =>
      api.post<ApiCreditCard>(`/api/credit-cards/${id}/charge`, { amountMinor }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.cards }),
  });
}

export function useAddSubscription() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; priceMinor: number; dayOfMonth: number }) =>
      api.post<ApiSubscription>('/api/subscriptions', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.subscriptions }),
  });
}

/**
 * Subscription toggles are optimistic: they are one-tap switches, and waiting
 * a round-trip to move makes the control feel broken. On error the snapshot is
 * rolled back.
 */
export function useUpdateSubscription() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; muted?: boolean; off?: boolean }) =>
      api.patch<ApiSubscription>(`/api/subscriptions/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      await client.cancelQueries({ queryKey: keys.subscriptions });
      const previous = client.getQueryData<ApiSubscription[]>(keys.subscriptions);
      client.setQueryData<ApiSubscription[]>(keys.subscriptions, current =>
        current?.map(sub => (sub.id === id ? { ...sub, ...patch } : sub))
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(keys.subscriptions, context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.subscriptions }),
  });
}

export function useApproveReceipt() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<ApiReceipt>(`/api/receipts/${id}`, { status: 'ok' }),
    onMutate: async id => {
      await client.cancelQueries({ queryKey: keys.receipts });
      const previous = client.getQueryData<ApiReceipt[]>(keys.receipts);
      client.setQueryData<ApiReceipt[]>(keys.receipts, current =>
        current?.map(receipt => (receipt.id === id ? { ...receipt, status: 'ok' } : receipt))
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(keys.receipts, context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.receipts }),
  });
}

export function useAddReceipt() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { merchant: string; amountMinor: number; category: string; status?: 'ok' | 'warn' }) =>
      api.post<ApiReceipt>('/api/receipts', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.receipts }),
  });
}

export function useAddMessage() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: ApiMessageKind; payload: Record<string, unknown> }) =>
      api.post<ApiMessage>('/api/messages', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.messages }),
  });
}

/**
 * Rejecting a proposed expense card. Optimistic, because the card should
 * disappear the moment it's tapped — waiting a round trip to remove something
 * the user just dismissed feels broken.
 */
export function useDeleteMessage() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/messages/${id}`),
    onMutate: async id => {
      await client.cancelQueries({ queryKey: keys.messages });
      const previous = client.getQueryData<ApiMessage[]>(keys.messages);
      client.setQueryData<ApiMessage[]>(keys.messages, current => current?.filter(m => m.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(keys.messages, context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.messages }),
  });
}

/**
 * One round trip runs the entire coach turn: the server persists the user's
 * message, calls the model with tools bound to their data, and persists the
 * reply. Nothing about the provider reaches the client.
 *
 * The user's own message is added optimistically so it appears the instant they
 * hit send, rather than after the model has finished thinking.
 *
 * `onSettled` deliberately *returns* the invalidation promise: that keeps
 * `isPending` true until the refetched messages have actually landed, which is
 * what drives the typing indicator. Without it the indicator vanishes a beat
 * before the reply renders, and the chat looks briefly empty.
 */
export function useSendChat() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post<void>('/api/chat', { text }),
    onMutate: async text => {
      await client.cancelQueries({ queryKey: keys.messages });
      const previous = client.getQueryData<ApiMessage[]>(keys.messages);
      const optimistic: ApiMessage = {
        id: `pending-${Date.now()}`,
        kind: 'user',
        payload: { text },
        createdAt: new Date().toISOString(),
      };
      client.setQueryData<ApiMessage[]>(keys.messages, current => [...(current ?? []), optimistic]);
      return { previous };
    },
    onError: (_error, _text, context) => {
      // The refetch below is the source of truth — if the server got as far as
      // storing the message before failing, it comes straight back.
      if (context?.previous) client.setQueryData(keys.messages, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.messages }),
  });
}

/**
 * Uploads a recorded voice note and runs it through the exact same coach turn
 * as useSendChat — the server transcribes it and then treats the transcript
 * as the message. No optimistic bubble: unlike typed text there is no
 * transcript to show until the server produces one, so the "sending" state is
 * a transient bubble the caller drives off `isPending`, not a real message.
 */
export function useSendVoice() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.postForm<void>('/api/voice', form),
    onSettled: () => client.invalidateQueries({ queryKey: keys.messages }),
  });
}

export function useUpdateSettings() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ApiSettings>) => api.patch<ApiSettings>('/api/settings', patch),
    onMutate: async patch => {
      await client.cancelQueries({ queryKey: keys.settings });
      const previous = client.getQueryData<ApiSettings>(keys.settings);
      client.setQueryData<ApiSettings>(keys.settings, current => (current ? { ...current, ...patch } : current));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(keys.settings, context.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.settings });
      invalidateMoney(client);
      // Insight cards have their amounts baked into the text, so a currency
      // change makes today's set stale. Refetching is what surfaces that —
      // the server flips `stale` and the provider regenerates.
      void client.invalidateQueries({ queryKey: keys.insights });
    },
  });
}
