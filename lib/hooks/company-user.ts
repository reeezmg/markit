/* eslint-disable */
import type { Prisma, CompanyUser } from "@prisma/client";
import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';
import { getHooksContext } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { MaybeRefOrGetter, ComputedRef } from 'vue';
import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '@zenstackhq/tanstack-query/runtime-v5/vue';
import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '@zenstackhq/tanstack-query/runtime-v5';
import type { PolicyCrudKind } from '@zenstackhq/runtime'
import metadata from './__model_meta';
type DefaultError = QueryError;

export function useCreateCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserCreateArgs, unknown>> | ComputedRef<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserCreateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserCreateArgs, DefaultError, CompanyUser, true>('CompanyUser', 'POST', `${endpoint}/companyUser/create`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserCreateArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserCreateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserCreateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserCreateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useCreateManyCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.CompanyUserCreateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.CompanyUserCreateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserCreateManyArgs, DefaultError, Prisma.BatchPayload, false>('CompanyUser', 'POST', `${endpoint}/companyUser/createMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserCreateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserCreateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserCreateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserCreateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useFindManyCompanyUser<TArgs extends Prisma.CompanyUserFindManyArgs, TQueryFnData = Array<Prisma.CompanyUserGetPayload<TArgs> & { $optimistic?: boolean }>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindManyArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/findMany`, args, options, fetch);
}

export function useInfiniteFindManyCompanyUser<TArgs extends Prisma.CompanyUserFindManyArgs, TQueryFnData = Array<Prisma.CompanyUserGetPayload<TArgs>>, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindManyArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindManyArgs>>, options?: MaybeRefOrGetter<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseInfiniteQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>>) {
    const { endpoint, fetch } = getHooksContext();
    return useInfiniteModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/findMany`, args, options, fetch);
}

export function useFindUniqueCompanyUser<TArgs extends Prisma.CompanyUserFindUniqueArgs, TQueryFnData = Prisma.CompanyUserGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindUniqueArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindUniqueArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/findUnique`, args, options, fetch);
}

export function useFindFirstCompanyUser<TArgs extends Prisma.CompanyUserFindFirstArgs, TQueryFnData = Prisma.CompanyUserGetPayload<TArgs> & { $optimistic?: boolean }, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindFirstArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.CompanyUserFindFirstArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/findFirst`, args, options, fetch);
}

export function useUpdateCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserUpdateArgs, unknown>> | ComputedRef<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserUpdateArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserUpdateArgs, DefaultError, CompanyUser, true>('CompanyUser', 'PUT', `${endpoint}/companyUser/update`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserUpdateArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserUpdateArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserUpdateArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserUpdateArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useUpdateManyCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.CompanyUserUpdateManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.CompanyUserUpdateManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserUpdateManyArgs, DefaultError, Prisma.BatchPayload, false>('CompanyUser', 'PUT', `${endpoint}/companyUser/updateMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserUpdateManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserUpdateManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserUpdateManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserUpdateManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useUpsertCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserUpsertArgs, unknown>> | ComputedRef<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserUpsertArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserUpsertArgs, DefaultError, CompanyUser, true>('CompanyUser', 'POST', `${endpoint}/companyUser/upsert`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserUpsertArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserUpsertArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserUpsertArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserUpsertArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserDeleteArgs, unknown>> | ComputedRef<UseMutationOptions<(CompanyUser | undefined), DefaultError, Prisma.CompanyUserDeleteArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserDeleteArgs, DefaultError, CompanyUser, true>('CompanyUser', 'DELETE', `${endpoint}/companyUser/delete`, metadata, options, fetch, true)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserDeleteArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserDeleteArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserDeleteArgs>, unknown>> | ComputedRef<UseMutationOptions<(CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined), DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserDeleteArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as (CheckSelect<T, CompanyUser, Prisma.CompanyUserGetPayload<T>> | undefined);
        },
    };
    return mutation;
}

export function useDeleteManyCompanyUser(options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.CompanyUserDeleteManyArgs, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.CompanyUserDeleteManyArgs, unknown>> & ExtraMutationOptions), 'mutationFn'>) {
    const { endpoint, fetch } = getHooksContext();
    const _mutation =
        useModelMutation<Prisma.CompanyUserDeleteManyArgs, DefaultError, Prisma.BatchPayload, false>('CompanyUser', 'DELETE', `${endpoint}/companyUser/deleteMany`, metadata, options, fetch, false)
        ;
    const mutation = {
        ..._mutation,
        mutateAsync: async <T extends Prisma.CompanyUserDeleteManyArgs>(
            args: Prisma.SelectSubset<T, Prisma.CompanyUserDeleteManyArgs>,
            options?: Omit<(MaybeRefOrGetter<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserDeleteManyArgs>, unknown>> | ComputedRef<UseMutationOptions<Prisma.BatchPayload, DefaultError, Prisma.SelectSubset<T, Prisma.CompanyUserDeleteManyArgs>, unknown>> & ExtraMutationOptions), 'mutationFn'>
        ) => {
            return (await _mutation.mutateAsync(
                args,
                options as any
            )) as Prisma.BatchPayload;
        },
    };
    return mutation;
}

export function useAggregateCompanyUser<TArgs extends Prisma.CompanyUserAggregateArgs, TQueryFnData = Prisma.GetCompanyUserAggregateType<TArgs>, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.CompanyUserAggregateArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.CompanyUserAggregateArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/aggregate`, args, options, fetch);
}

export function useGroupByCompanyUser<TArgs extends Prisma.CompanyUserGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.CompanyUserGroupByArgs['orderBy'] } : { orderBy?: Prisma.CompanyUserGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<TArgs['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
    Array<PickEnumerable<Prisma.CompanyUserGroupByOutputType, TArgs['by']> &
        {
            [P in ((keyof TArgs) & (keyof Prisma.CompanyUserGroupByOutputType))]: P extends '_count'
            ? TArgs[P] extends boolean
            ? number
            : Prisma.GetScalarType<TArgs[P], Prisma.CompanyUserGroupByOutputType[P]>
            : Prisma.GetScalarType<TArgs[P], Prisma.CompanyUserGroupByOutputType[P]>
        }
    > : InputErrors, TData = TQueryFnData, TError = DefaultError>(args: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.CompanyUserGroupByArgs, OrderByArg> & InputErrors>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.SubsetIntersection<TArgs, Prisma.CompanyUserGroupByArgs, OrderByArg> & InputErrors>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/groupBy`, args, options, fetch);
}

export function useCountCompanyUser<TArgs extends Prisma.CompanyUserCountArgs, TQueryFnData = TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.CompanyUserCountAggregateOutputType> : number, TData = TQueryFnData, TError = DefaultError>(args?: MaybeRefOrGetter<Prisma.SelectSubset<TArgs, Prisma.CompanyUserCountArgs>> | ComputedRef<Prisma.SelectSubset<TArgs, Prisma.CompanyUserCountArgs>>, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<TQueryFnData, TData, TError>('CompanyUser', `${endpoint}/companyUser/count`, args, options, fetch);
}

export function useCheckCompanyUser<TError = DefaultError>(args: { operation: PolicyCrudKind; where?: { companyId?: string; userId?: string }; }, options?: (MaybeRefOrGetter<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> | ComputedRef<Omit<UseQueryOptions<boolean, TError, boolean>, 'queryKey'>> & ExtraQueryOptions)) {
    const { endpoint, fetch } = getHooksContext();
    return useModelQuery<boolean, boolean, TError>('CompanyUser', `${endpoint}/companyUser/check`, args, options, fetch);
}
