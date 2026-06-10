import React from 'react';
import { Button } from './Button';
import { ExternalLink } from 'lucide-react';

interface AttachmentViewerModalProps {
  urls: string[];
  text?: string;
  onClose: () => void;
}

export const AttachmentViewerModal: React.FC<AttachmentViewerModalProps> = ({
  urls,
  text,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="card p-6 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Attachment Proofs</h3>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {urls.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Media Files ({urls.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {urls.map((url, index) => {
                  // Basic check if URL is an image to display it inline
                  const isImage = url.match(/\.(jpeg|jpg|gif|png|heic)(\?.*)?$/i) != null || url.includes('token=');
                  
                  return (
                    <div key={index} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex flex-col">
                      {isImage ? (
                        <div className="w-full h-40 bg-slate-100 flex items-center justify-center overflow-hidden">
                          <img src={url} alt={`Attachment ${index + 1}`} className="max-w-full max-h-full object-contain" loading="lazy" />
                        </div>
                      ) : (
                        <div className="w-full h-40 bg-slate-100 flex items-center justify-center">
                          <span className="text-slate-400">Preview not available</span>
                        </div>
                      )}
                      <div className="p-2 border-t border-slate-200 bg-white">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-teal-600 hover:underline text-sm font-medium w-full truncate"
                          title={url}
                        >
                          <ExternalLink size={14} className="flex-shrink-0" />
                          <span className="truncate">Open file {index + 1}</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {text != null && text !== '' && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Text Note</p>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-lg p-4 bg-slate-50 min-h-[100px] font-sans">
                {text}
              </pre>
            </div>
          )}

          {urls.length === 0 && !text && (
            <p className="text-sm text-slate-500 italic">No attachments provided.</p>
          )}
        </div>

        <div className="mt-6 flex justify-end pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};
