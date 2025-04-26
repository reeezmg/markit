/* eslint-disable */
import type { Prisma, Pipeline } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreatePipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineCreateArgs, DefaultError, Pipeline, true>('Pipeline', 'POST', `${endpoint}/pipeline/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyPipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.PipelineCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.PipelineCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('Pipeline', 'POST', `${endpoint}/pipeline/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.PipelineCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.PipelineCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyPipeline<TArgs extends Prisma.PipelineFindManyArgs, TQueryFnData = Array<Prisma.PipelineGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.PipelineFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.PipelineFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/findMany`, args, options, fetch);
}

export function useInfiniteFindManyPipeline<TArgs extends Prisma.PipelineFindManyArgs, TQueryFnData = Array<Prisma.PipelineGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.PipelineFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.PipelineFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/findMany`, args, options, fetch);
}

export function useFindUniquePipeline<TArgs extends Prisma.PipelineFindUniqueArgs, TQueryFnData = Prisma.PipelineGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.PipelineFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.PipelineFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/findUnique`, args, options, fetch);
}

export function useFindFirstPipeline<TArgs extends Prisma.PipelineFindFirstArgs, TQueryFnData = Prisma.PipelineGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.PipelineFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.PipelineFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/findFirst`, args, options, fetch);
}

export function useUpdatePipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineUpdateArgs, DefaultError, Pipeline, true>('Pipeline', 'PUT', `${endpoint}/pipeline/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyPipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.PipelineUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.PipelineUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('Pipeline', 'PUT', `${endpoint}/pipeline/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.PipelineUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.PipelineUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertPipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineUpsertArgs, DefaultError, Pipeline, true>('Pipeline', 'POST', `${endpoint}/pipeline/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeletePipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(Pipeline | undefined), DefaultError, Prisma.PipelineDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineDeleteArgs, DefaultError, Pipeline, true>('Pipeline', 'DELETE', `${endpoint}/pipeline/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.PipelineDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, Pipeline, Prisma.PipelineGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyPipeline(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.PipelineDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.PipelineDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.PipelineDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('Pipeline', 'DELETE', `${endpoint}/pipeline/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.PipelineDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.PipelineDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.PipelineDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.PipelineDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregatePipeline<TArgs extends Prisma.PipelineAggregateArgs, TQueryFnData = Prisma.GetPipelineAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.PipelineAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.PipelineAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/aggregate`, args, options, fetch);
}

export function useGroupByPipeline<TArgs extends Prisma.PipelineGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.PipelineGroupByArgs['orderBy'] } : { orderBy?: Prisma.PipelineGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.PipelineGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.PipelineGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.PipelineGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.PipelineGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.PipelineGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.PipelineGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/groupBy`, args, options, fetch);
}

export function useCountPipeline<TArgs extends Prisma.PipelineCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.PipelineCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.PipelineCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.PipelineCountArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('Pipeline', `${endpoint}/pipeline/count`, args, options, fetch);
}

export function useCheckPipeline<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { id?: string; companyId?: string }; }, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('Pipeline', `${endpoint}/pipeline/check`, args, options, fetch);
}
