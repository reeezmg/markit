/* eslint-disable */
import type { Prisma, VariantSizeBarcode } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeCreateArgs, DefaultError, VariantSizeBarcode, true>('VariantSizeBarcode', 'POST', `${endpoint}/variantSizeBarcode/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantSizeBarcodeCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantSizeBarcodeCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('VariantSizeBarcode', 'POST', `${endpoint}/variantSizeBarcode/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeFindManyArgs, TQueryFnData = Array<Prisma.VariantSizeBarcodeGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/findMany`, args, options, fetch);
}

export function useInfiniteFindManyVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeFindManyArgs, TQueryFnData = Array<Prisma.VariantSizeBarcodeGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/findMany`, args, options, fetch);
}

export function useFindUniqueVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeFindUniqueArgs, TQueryFnData = Prisma.VariantSizeBarcodeGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/findUnique`, args, options, fetch);
}

export function useFindFirstVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeFindFirstArgs, TQueryFnData = Prisma.VariantSizeBarcodeGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/findFirst`, args, options, fetch);
}

export function useUpdateVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeUpdateArgs, DefaultError, VariantSizeBarcode, true>('VariantSizeBarcode', 'PUT', `${endpoint}/variantSizeBarcode/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantSizeBarcodeUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantSizeBarcodeUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('VariantSizeBarcode', 'PUT', `${endpoint}/variantSizeBarcode/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeUpsertArgs, DefaultError, VariantSizeBarcode, true>('VariantSizeBarcode', 'POST', `${endpoint}/variantSizeBarcode/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(VariantSizeBarcode | undefined), DefaultError, Prisma.VariantSizeBarcodeDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeDeleteArgs, DefaultError, VariantSizeBarcode, true>('VariantSizeBarcode', 'DELETE', `${endpoint}/variantSizeBarcode/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, VariantSizeBarcode, Prisma.VariantSizeBarcodeGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyVariantSizeBarcode(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantSizeBarcodeDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.VariantSizeBarcodeDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.VariantSizeBarcodeDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('VariantSizeBarcode', 'DELETE', `${endpoint}/variantSizeBarcode/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.VariantSizeBarcodeDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.VariantSizeBarcodeDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeAggregateArgs, TQueryFnData = Prisma.GetVariantSizeBarcodeAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/aggregate`, args, options, fetch);
}

export function useGroupByVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.VariantSizeBarcodeGroupByArgs['orderBy'] } : { orderBy?: Prisma.VariantSizeBarcodeGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.VariantSizeBarcodeGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.VariantSizeBarcodeGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.VariantSizeBarcodeGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.VariantSizeBarcodeGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.VariantSizeBarcodeGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.VariantSizeBarcodeGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/groupBy`, args, options, fetch);
}

export function useCountVariantSizeBarcode<TArgs extends Prisma.VariantSizeBarcodeCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.VariantSizeBarcodeCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.VariantSizeBarcodeCountArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/count`, args, options, fetch);
}

export function useCheckVariantSizeBarcode<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { id?: number; variantId?: string; size?: string; barcode?: string }; }, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('VariantSizeBarcode', `${endpoint}/variantSizeBarcode/check`, args, options, fetch);
}
