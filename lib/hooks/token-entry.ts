/******************************************************************************
 * This file was generated by ZenStack CLI.
 ******************************************************************************/

/* eslint-disable */
// @ts-nocheck

import type { Prisma, TokenEntry } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef, UnwrapRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryCreateArgs, DefaultError, TokenEntry, true>('TokenEntry', 'POST', `${endpoint}/tokenEntry/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.TokenEntryCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.TokenEntryCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('TokenEntry', 'POST', `${endpoint}/tokenEntry/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyTokenEntry<TArgs extends Prisma.TokenEntryFindManyArgs, TQueryFnData = Array<Prisma.TokenEntryGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/findMany`, args, options, fetch);
}

export function useInfiniteFindManyTokenEntry<TArgs extends Prisma.TokenEntryFindManyArgs, TQueryFnData = Array<Prisma.TokenEntryGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>, 'queryKey' | 'initialPageParam'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>, 'queryKey' | 'initialPageParam'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/findMany`, args, options, fetch);
}

export function useFindUniqueTokenEntry<TArgs extends Prisma.TokenEntryFindUniqueArgs, TQueryFnData = Prisma.TokenEntryGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/findUnique`, args, options, fetch);
}

export function useFindFirstTokenEntry<TArgs extends Prisma.TokenEntryFindFirstArgs, TQueryFnData = Prisma.TokenEntryGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.TokenEntryFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/findFirst`, args, options, fetch);
}

export function useUpdateTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryUpdateArgs, DefaultError, TokenEntry, true>('TokenEntry', 'PUT', `${endpoint}/tokenEntry/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.TokenEntryUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.TokenEntryUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('TokenEntry', 'PUT', `${endpoint}/tokenEntry/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryUpsertArgs, DefaultError, TokenEntry, true>('TokenEntry', 'POST', `${endpoint}/tokenEntry/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(TokenEntry | undefined), DefaultError, Prisma.TokenEntryDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryDeleteArgs, DefaultError, TokenEntry, true>('TokenEntry', 'DELETE', `${endpoint}/tokenEntry/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, TokenEntry, Prisma.TokenEntryGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyTokenEntry(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.TokenEntryDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.TokenEntryDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.TokenEntryDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('TokenEntry', 'DELETE', `${endpoint}/tokenEntry/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.TokenEntryDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.TokenEntryDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.TokenEntryDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateTokenEntry<TArgs extends Prisma.TokenEntryAggregateArgs, TQueryFnData = Prisma.GetTokenEntryAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.TokenEntryAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.TokenEntryAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/aggregate`, args, options, fetch);
}

export function useGroupByTokenEntry<TArgs extends Prisma.TokenEntryGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.TokenEntryGroupByArgs['orderBy'] } : { orderBy?: Prisma.TokenEntryGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.TokenEntryGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.TokenEntryGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.TokenEntryGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.TokenEntryGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.TokenEntryGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.TokenEntryGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/groupBy`, args, options, fetch);
}

export function useCountTokenEntry<TArgs extends Prisma.TokenEntryCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.TokenEntryCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.TokenEntryCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.TokenEntryCountArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('TokenEntry', `${endpoint}/tokenEntry/count`, args, options, fetch);
}

export function useCheckTokenEntry<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { id?: string; tokenNo?: string; companyId?: string; itemId?: string; variantId?: string; barcode?: string; categoryId?: string; size?: string; name?: string; qty?: number; rate?: number; discount?: number; tax?: number; value?: number; totalQty?: number }; }, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<boolean, TError, boolean>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<boolean, TError, boolean>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('TokenEntry', `${endpoint}/tokenEntry/check`, args, options, fetch);
}
