/* eslint-disable */
declare module 'ag-grid-community' {
    export interface ColDef<TData = any, TValue = any> {
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

    export const AllCommunityModule: any;

    export const ModuleRegistry: {
        registerModules(modules: any[]): void;
    };
}

declare module 'ag-grid-react' {
    import { Component } from 'react';

    export interface CustomCellRendererProps<TData = any, TValue = any> {
        value: TValue;
        data: TData;
        node: any;
        colDef: any;
        rowIndex: number;
        api: any;
    }

    export interface AgGridReactProps<TData = any> {
        ref?: any;
        rowData?: TData[] | null;
        columnDefs?: any[];
        defaultColDef?: any;
        rowSelection?: any;
        rowHeight?: number;
        headerHeight?: number;
        loading?: boolean;
        rowClassRules?: Record<string, (params: any) => boolean>;
        onRowClicked?: (event: any) => void;
        onCellKeyDown?: (event: any) => void;
        onSelectionChanged?: (event: any) => void;
        onGridReady?: (params: any) => void;
        getRowId?: (params: any) => string;
        theme?: any;
        domLayout?: string;
        animateRows?: boolean;
        suppressCellFocus?: boolean;
        [key: string]: any;
    }

    export class AgGridReact<TData = any> extends Component<AgGridReactProps<TData>> {
        api: any;
    }
}

declare module 'ag-grid-community/styles/ag-grid.css' {}
declare module 'ag-grid-community/styles/ag-theme-quartz.css' {}
