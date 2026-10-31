/* eslint-disable */
export interface ColDef<_TData = any, _TValue = any> {
    field?: string;
    headerName?: string;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    flex?: number;
    pinned?: 'left' | 'right' | boolean | null;
    sortable?: boolean;
    filter?: boolean | string;
    resizable?: boolean;
    cellRenderer?: any;
    valueGetter?: (params: any) => any;
    valueFormatter?: (params: any) => string;
    comparator?: (valueA: any, valueB: any, nodeA?: any, nodeB?: any, isDescending?: boolean) => number;
    cellClass?: string | string[] | ((params: any) => string | string[]);
    headerClass?: string;
    suppressMovable?: boolean;
}

export interface GetRowIdParams<TData = any> {
    data: TData;
}

export const AllCommunityModule = {};

export const ModuleRegistry = {
    registerModules(_modules: any[]): void {},
};
