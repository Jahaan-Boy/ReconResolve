/* eslint-disable */
import { forwardRef, useImperativeHandle, useState } from 'react';

export interface CustomCellRendererProps<TData = any, TValue = any> {
    value: TValue;
    data: TData;
    node: any;
    colDef: any;
    rowIndex: number;
    api: any;
}

export interface AgGridReactProps<_TData = any> {
    rowData?: any[] | null;
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

export const AgGridReact = forwardRef<any, AgGridReactProps>(function AgGridReact(props, ref) {
    const { rowData = [], columnDefs = [], rowClassRules = {}, onRowClicked, getRowId } = props;
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const api = {
        getRowNode: (id: string) => {
            const item = (rowData || []).find((r: any) => (getRowId ? getRowId({ data: r }) : r?.id) === id);
            if (!item) return null;
            return {
                isSelected: () => selectedNodeId === id,
                setSelected: (selected: boolean) => {
                    setSelectedNodeId(selected ? id : null);
                },
            };
        },
        ensureNodeVisible: () => {},
        deselectAll: () => setSelectedNodeId(null),
        getSelectedNodes: () => {
            const item = (rowData || []).find((r: any) => (getRowId ? getRowId({ data: r }) : r?.id) === selectedNodeId);
            return item ? [{ data: item }] : [];
        },
    };

    useImperativeHandle(ref, () => ({ api }), [rowData, selectedNodeId]);

    return (
        <div className="w-full h-full overflow-auto">
            <table className="w-full border-collapse text-left text-xs text-slate-700">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                    <tr>
                        {columnDefs.map((col: any, idx: number) => (
                            <th
                                key={col.field || idx}
                                className="px-3 py-2.5 font-semibold text-slate-600 uppercase tracking-wider text-[10px]"
                                style={{ width: col.width, minWidth: col.minWidth }}
                            >
                                {col.headerName || col.field}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {(rowData || []).map((row: any, rIdx: number) => {
                        const rowId = getRowId ? getRowId({ data: row }) : row?.id || String(rIdx);
                        const isSelected = selectedNodeId === rowId || (rowClassRules['flowops-row-selected']?.({ data: row }) ?? false);

                        return (
                            <tr
                                key={rowId}
                                onClick={() => {
                                    setSelectedNodeId(rowId);
                                    onRowClicked?.({ data: row });
                                }}
                                className={`cursor-pointer transition-colors ${
                                    isSelected
                                        ? 'bg-blue-50/70 border-l-2 border-blue-600'
                                        : 'hover:bg-slate-50/80'
                                }`}
                            >
                                {columnDefs.map((col: any, cIdx: number) => {
                                    const value = col.valueGetter
                                        ? col.valueGetter({ data: row })
                                        : col.field
                                        ? row[col.field]
                                        : undefined;

                                    return (
                                        <td key={col.field || cIdx} className="px-3 py-2 align-middle">
                                            {col.cellRenderer ? (
                                                <col.cellRenderer
                                                    value={value}
                                                    data={row}
                                                    node={{ id: rowId, isSelected: () => isSelected }}
                                                    colDef={col}
                                                    rowIndex={rIdx}
                                                    api={api}
                                                />
                                            ) : col.valueFormatter ? (
                                                col.valueFormatter({ value })
                                            ) : (
                                                String(value ?? '')
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
});
