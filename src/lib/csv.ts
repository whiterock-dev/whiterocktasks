export type CsvColumn<T> = {
    header: string;
    accessor: (row: T) => unknown;
};

const escapeCsvValue = (value: unknown): string => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
};

export const buildCsvContent = <T>(rows: T[], columns: CsvColumn<T>[]): string => {
    const headerRow = columns.map((column) => escapeCsvValue(column.header)).join(',');
    const dataRows = rows.map((row) =>
        columns
            .map((column) => escapeCsvValue(column.accessor(row)))
            .join(',')
    );

    return [headerRow, ...dataRows].join('\n');
};

export const downloadCsvFile = (csvContent: string, fileName: string): void => {
    const safeName = fileName.toLowerCase().endsWith('.csv') ? fileName : `${fileName}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportRowsToCsv = <T>(opts: {
    rows: T[];
    columns: CsvColumn<T>[];
    fileName: string;
}): void => {
    const { rows, columns, fileName } = opts;
    const csvContent = buildCsvContent(rows, columns);
    downloadCsvFile(csvContent, fileName);
};
