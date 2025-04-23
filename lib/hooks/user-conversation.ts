/* eslint-disable */
import type { Prisma, UserConversation } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationCreateArgs, DefaultError, UserConversation, true>('UserConversation', 'POST', `${endpoint}/userConversation/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.UserConversationCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.UserConversationCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('UserConversation', 'POST', `${endpoint}/userConversation/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyUserConversation<TArgs extends Prisma.UserConversationFindManyArgs, TQueryFnData = Array<Prisma.UserConversationGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/findMany`, args, options, fetch);
}

export function useInfiniteFindManyUserConversation<TArgs extends Prisma.UserConversationFindManyArgs, TQueryFnData = Array<Prisma.UserConversationGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/findMany`, args, options, fetch);
}

export function useFindUniqueUserConversation<TArgs extends Prisma.UserConversationFindUniqueArgs, TQueryFnData = Prisma.UserConversationGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/findUnique`, args, options, fetch);
}

export function useFindFirstUserConversation<TArgs extends Prisma.UserConversationFindFirstArgs, TQueryFnData = Prisma.UserConversationGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.UserConversationFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/findFirst`, args, options, fetch);
}

export function useUpdateUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationUpdateArgs, DefaultError, UserConversation, true>('UserConversation', 'PUT', `${endpoint}/userConversation/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.UserConversationUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.UserConversationUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('UserConversation', 'PUT', `${endpoint}/userConversation/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationUpsertArgs, DefaultError, UserConversation, true>('UserConversation', 'POST', `${endpoint}/userConversation/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(UserConversation | undefined), DefaultError, Prisma.UserConversationDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationDeleteArgs, DefaultError, UserConversation, true>('UserConversation', 'DELETE', `${endpoint}/userConversation/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, UserConversation, Prisma.UserConversationGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyUserConversation(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.UserConversationDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.UserConversationDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.UserConversationDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('UserConversation', 'DELETE', `${endpoint}/userConversation/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.UserConversationDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.UserConversationDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.UserConversationDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateUserConversation<TArgs extends Prisma.UserConversationAggregateArgs, TQueryFnData = Prisma.GetUserConversationAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.UserConversationAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.UserConversationAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/aggregate`, args, options, fetch);
}

export function useGroupByUserConversation<TArgs extends Prisma.UserConversationGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserConversationGroupByArgs['orderBy'] } : { orderBy?: Prisma.UserConversationGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.UserConversationGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.UserConversationGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.UserConversationGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.UserConversationGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.UserConversationGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.UserConversationGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/groupBy`, args, options, fetch);
}

export function useCountUserConversation<TArgs extends Prisma.UserConversationCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.UserConversationCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.UserConversationCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.UserConversationCountArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('UserConversation', `${endpoint}/userConversation/count`, args, options, fetch);
}

export function useCheckUserConversation<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { userId?: string; conversationId?: string }; }, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('UserConversation', `${endpoint}/userConversation/check`, args, options, fetch);
}
