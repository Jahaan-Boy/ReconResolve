import { cn } from '@/lib/cn';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return <div className={cn('animate-pulse rounded bg-slate-200/80', className)} />;
}

export function TableRowSkeleton() {
    return (
        <tr className="border-b border-slate-100 animate-pulse">
            <td className="px-3 py-3">
                <Skeleton className="h-4 w-20" />
            </td>
            <td className="px-3 py-3">
                <Skeleton className="h-5 w-24 rounded-full" />
            </td>
            <td className="px-3 py-3">
                <Skeleton className="h-5 w-16 rounded-full" />
            </td>
            <td className="px-3 py-3">
                <Skeleton className="h-4 w-28" />
            </td>
            <td className="px-3 py-3">
                <Skeleton className="h-4 w-20" />
            </td>
            <td className="px-3 py-3">
                <Skeleton className="h-4 w-24" />
            </td>
            <td className="px-3 py-3 text-right">
                <Skeleton className="h-4 w-16 ml-auto" />
            </td>
        </tr>
    );
}

export function InspectorSkeleton() {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-44 rounded-xl" />
                <Skeleton className="h-44 rounded-xl" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
        </div>
    );
}
