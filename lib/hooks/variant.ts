/* eslint-disable */
import type { Prisma, Variant } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantCreateArgs, DefaultError, Variant, true>('Variant', 'POST', `${endpoint}/variant/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('Variant', 'POST', `${endpoint}/variant/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyVariant<TArgs extends Prisma.VariantFindManyArgs, TQueryFnData = Array<Prisma.VariantGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/findMany`, args, options, fetch);
}

export function useInfiniteFindManyVariant<TArgs extends Prisma.VariantFindManyArgs, TQueryFnData = Array<Prisma.VariantGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/findMany`, args, options, fetch);
}

export function useFindUniqueVariant<TArgs extends Prisma.VariantFindUniqueArgs, TQueryFnData = Prisma.VariantGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/findUnique`, args, options, fetch);
}

export function useFindFirstVariant<TArgs extends Prisma.VariantFindFirstArgs, TQueryFnData = Prisma.VariantGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/findFirst`, args, options, fetch);
}

export function useUpdateVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantUpdateArgs, DefaultError, Variant, true>('Variant', 'PUT', `${endpoint}/variant/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('Variant', 'PUT', `${endpoint}/variant/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantUpsertArgs, DefaultError, Variant, true>('Variant', 'POST', `${endpoint}/variant/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(Variant | undefined), DefaultError, Prisma.VariantDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantDeleteArgs, DefaultError, Variant, true>('Variant', 'DELETE', `${endpoint}/variant/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Variant, Prisma.VariantGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyVariant(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('Variant', 'DELETE', `${endpoint}/variant/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateVariant<TArgs extends Prisma.VariantAggregateArgs, TQueryFnData = Prisma.GetVariantAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/aggregate`, args, options, fetch);
}

export function useGroupByVariant<TArgs extends Prisma.VariantGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.VariantGroupByArgs['orderBy'] } : { orderBy?: Prisma.VariantGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.VariantGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.VariantGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.VariantGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.VariantGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.VariantGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.VariantGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/groupBy`, args, options, fetch);
}

export function useCountVariant<TArgs extends Prisma.VariantCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.VariantCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantCountArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Variant', `${endpoint}/variant/count`, args, options, fetch);
}

export function useCheckVariant<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { id?: string; name?: string; code?: string; status?: boolean; qty?: number; images?: string; productId?: string; companyId?: string }; }, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('Variant', `${endpoint}/variant/check`, args, options, fetch);
}
