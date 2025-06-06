/******************************************************************************
 * This file was generated by ZenStack CLI.
 ******************************************************************************/

/* eslint-disable */
// @ts-nocheck

import type { Prisma, EmailOtp } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef, UnwrapRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpCreateArgs, DefaultError, EmailOtp, true>('EmailOtp', 'POST', `${endpoint}/emailOtp/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.EmailOtpCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.EmailOtpCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('EmailOtp', 'POST', `${endpoint}/emailOtp/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyEmailOtp<TArgs extends Prisma.EmailOtpFindManyArgs, TQueryFnData = Array<Prisma.EmailOtpGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/findMany`, args, options, fetch);
}

export function useInfiniteFindManyEmailOtp<TArgs extends Prisma.EmailOtpFindManyArgs, TQueryFnData = Array<Prisma.EmailOtpGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>, 'queryKey' | 'initialPageParam'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TData>>, 'queryKey' | 'initialPageParam'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/findMany`, args, options, fetch);
}

export function useFindUniqueEmailOtp<TArgs extends Prisma.EmailOtpFindUniqueArgs, TQueryFnData = Prisma.EmailOtpGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/findUnique`, args, options, fetch);
}

export function useFindFirstEmailOtp<TArgs extends Prisma.EmailOtpFindFirstArgs, TQueryFnData = Prisma.EmailOtpGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.EmailOtpFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/findFirst`, args, options, fetch);
}

export function useUpdateEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpUpdateArgs, DefaultError, EmailOtp, true>('EmailOtp', 'PUT', `${endpoint}/emailOtp/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.EmailOtpUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.EmailOtpUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('EmailOtp', 'PUT', `${endpoint}/emailOtp/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpUpsertArgs, DefaultError, EmailOtp, true>('EmailOtp', 'POST', `${endpoint}/emailOtp/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(EmailOtp | undefined), DefaultError, Prisma.EmailOtpDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpDeleteArgs, DefaultError, EmailOtp, true>('EmailOtp', 'DELETE', `${endpoint}/emailOtp/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, EmailOtp, Prisma.EmailOtpGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyEmailOtp(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.EmailOtpDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.EmailOtpDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.EmailOtpDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('EmailOtp', 'DELETE', `${endpoint}/emailOtp/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.EmailOtpDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.EmailOtpDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.EmailOtpDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateEmailOtp<TArgs extends Prisma.EmailOtpAggregateArgs, TQueryFnData = Prisma.GetEmailOtpAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.EmailOtpAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.EmailOtpAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/aggregate`, args, options, fetch);
}

export function useGroupByEmailOtp<TArgs extends Prisma.EmailOtpGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.EmailOtpGroupByArgs['orderBy'] } : { orderBy?: Prisma.EmailOtpGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.EmailOtpGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.EmailOtpGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.EmailOtpGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.EmailOtpGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.EmailOtpGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.EmailOtpGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/groupBy`, args, options, fetch);
}

export function useCountEmailOtp<TArgs extends Prisma.EmailOtpCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.EmailOtpCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.EmailOtpCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.EmailOtpCountArgs>>, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<TQueryFnData, TError, TData>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('EmailOtp', `${endpoint}/emailOtp/count`, args, options, fetch);
}

export function useCheckEmailOtp<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { id?: string; email?: string; otp?: string }; }, options?: (MaybeRefOrGetter<Omit<UnwrapRef<UseQueryOptions<boolean, TError, boolean>>, 'queryKey'>> | ComputedRef<Omit<UnwrapRef<UseQueryOptions<boolean, TError, boolean>>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('EmailOtp', `${endpoint}/emailOtp/check`, args, options, fetch);
}
