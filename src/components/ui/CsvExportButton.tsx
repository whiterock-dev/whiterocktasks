import React from 'react';
import { Download } from 'lucide-react';
import { Button } from './Button';

type CsvExportButtonProps = {
    onClick: () => void | Promise<void>;
    loading?: boolean;
    disabled?: boolean;
    label?: string;
    className?: string;
};

export const CsvExportButton: React.FC<CsvExportButtonProps> = ({
    onClick,
    loading = false,
    disabled = false,
    label = 'Export CSV',
    className = 'flex gap-2',
}) => {
    return (
        <Button
            type="button"
            variant="secondary"
            onClick={onClick}
            isLoading={loading}
            disabled={disabled}
            className={className}
        >
            <Download size={16} />
            {label}
        </Button>
    );
};
