/* eslint-disable */
import type { Prisma, Message } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageCreateArgs, DefaultError, Message, true>('Message', 'POST', `${endpoint}/message/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.MessageCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.MessageCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('Message', 'POST', `${endpoint}/message/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.MessageCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.MessageCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyMessage<TArgs extends Prisma.MessageFindManyArgs, TQueryFnData = Array<Prisma.MessageGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.MessageFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.MessageFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/findMany`, args, options, fetch);
}

export function useInfiniteFindManyMessage<TArgs extends Prisma.MessageFindManyArgs, TQueryFnData = Array<Prisma.MessageGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.MessageFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.MessageFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/findMany`, args, options, fetch);
}

export function useFindUniqueMessage<TArgs extends Prisma.MessageFindUniqueArgs, TQueryFnData = Prisma.MessageGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.MessageFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.MessageFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/findUnique`, args, options, fetch);
}

export function useFindFirstMessage<TArgs extends Prisma.MessageFindFirstArgs, TQueryFnData = Prisma.MessageGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.MessageFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.MessageFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/findFirst`, args, options, fetch);
}

export function useUpdateMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageUpdateArgs, DefaultError, Message, true>('Message', 'PUT', `${endpoint}/message/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.MessageUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.MessageUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('Message', 'PUT', `${endpoint}/message/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.MessageUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.MessageUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageUpsertArgs, DefaultError, Message, true>('Message', 'POST', `${endpoint}/message/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(Message | undefined), DefaultError, Prisma.MessageDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageDeleteArgs, DefaultError, Message, true>('Message', 'DELETE', `${endpoint}/message/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.MessageDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Message, Prisma.MessageGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyMessage(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.MessageDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.MessageDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.MessageDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('Message', 'DELETE', `${endpoint}/message/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.MessageDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.MessageDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.MessageDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.MessageDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateMessage<TArgs extends Prisma.MessageAggregateArgs, TQueryFnData = Prisma.GetMessageAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.MessageAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.MessageAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/aggregate`, args, options, fetch);
}

export function useGroupByMessage<TArgs extends Prisma.MessageGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.MessageGroupByArgs['orderBy'] } : { orderBy?: Prisma.MessageGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
    ? `Error: "by" must not be empty.`
    : HavingValid extends Prisma.False
    ? {
        [P in HavingFields]: P extends ByFields
        ? never
        : P extends string
        ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
        : [
            Error,
            'Field ',
            P,
            ` in "having" needs to be provided in "by"`,
        ]
    }[HavingFields]
    : 'take' extends Prisma.Keys<TArgs>
    ? 'orderBy' extends Prisma.Keys<TArgs>
    ? ByValid extends Prisma.True
    ? {}
    : {
        [P in OrderFields]: P extends ByFields
        ? never
        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
    }[OrderFields]
    : 'Error: If you provide "take", you also need to provide "orderBy"'
    : 'skip' extends Prisma.Keys<TArgs>
    ? 'orderBy' extends Prisma.Keys<TArgs>
    ? ByValid extends Prisma.True
    ? {}
    : {
        [P in OrderFields]: P extends ByFields
        ? never
        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
    }[OrderFields]
    : 'Error: If you provide "skip", you also need to provide "orderBy"'
    : ByValid extends Prisma.True
    ? {}
    : {
        [P in OrderFields]: P extends ByFields
        ? never
        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
    }[OrderFields], TQueryFnData = {} extends InputErrors ?
    Array<PickEnumerable<Prisma.MessageGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.MessageGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.MessageGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.MessageGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.MessageGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.MessageGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/groupBy`, args, options, fetch);
}

export function useCountMessage<TArgs extends Prisma.MessageCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.MessageCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.MessageCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.MessageCountArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Message', `${endpoint}/message/count`, args, options, fetch);
}

export function useCheckMessage<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { id?: string; conversationId?: string; senderId?: string; text?: string; seen?: string; replyto?: string; edited?: boolean; deleted?: boolean }; }, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('Message', `${endpoint}/message/check`, args, options, fetch);
}
