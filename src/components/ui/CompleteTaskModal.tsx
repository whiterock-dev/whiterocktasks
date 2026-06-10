import React, { useState } from 'react';
import { Task } from '../../types';
import { Button } from './Button';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { compressImageForUpload } from '../../lib/utils';
import { X } from 'lucide-react';

interface CompleteTaskModalProps {
  task: Task;
  onClose: () => void;
  onComplete: (
    task: Task,
    url?: string,
    text?: string,
    remark?: string,
    opts?: { closePermanently?: boolean; attachment_urls?: string[] }
  ) => Promise<void>;
  completing: boolean;
}

export const CompleteTaskModal: React.FC<CompleteTaskModalProps> = ({
  task,
  onClose,
  onComplete,
  completing,
}) => {
  const [doerRemark, setDoerRemark] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentText, setAttachmentText] = useState('');
  
  // Multiple files tracking
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [uploadProgresses, setUploadProgresses] = useState<{ [key: string]: number }>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleMediaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setAttachmentUrl('');
    setUploadError(null);

    const currentCount = attachmentFiles.length;
    const newCount = currentCount + files.length;
    
    if (newCount > 10) {
      setUploadError('Maximum 10 attachments allowed per task.');
      return;
    }

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`File ${file.name} exceeds the 10 MB limit.`);
        return;
      }
      validFiles.push(file);
    }

    setAttachmentFiles((prev) => [...prev, ...validFiles]);
    
    // Clear input so selecting same file again triggers onChange
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Determine validations
    const isText = task.attachment_type === 'text';
    
    // Validate links if no files and no text
    if (task.attachment_required) {
      if (isText && !attachmentText.trim()) return;
      if (!isText && attachmentFiles.length === 0 && !attachmentUrl.trim()) return;
      
      if (!isText && attachmentFiles.length === 0) {
        const candidateUrl = attachmentUrl.trim();
        try {
          const parsed = new URL(candidateUrl);
          const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
          if (!isHttp) {
            setUploadError('Please enter a valid media link starting with http:// or https://');
            return;
          }
        } catch {
          setUploadError('Please enter a valid media link starting with http:// or https://');
          return;
        }
      }
    }

    try {
      let finalUrls: string[] = [];
      let singleLegacyUrl: string | undefined = undefined;

      // Upload files if any
      if (attachmentFiles.length > 0) {
        setUploading(true);
        setUploadError(null);
        
        const uploadPromises = attachmentFiles.map(async (file, index) => {
          const fileId = `${Date.now()}_${index}_${file.name}`;
          const path = `task-attachments/${task.id}/${fileId}`;
          const storageRef = ref(storage, path);
          
          const toUpload = await compressImageForUpload(file);
          const uploadTask = uploadBytesResumable(storageRef, toUpload);

          return new Promise<string>((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgresses((prev) => ({ ...prev, [file.name]: progress }));
              },
              (err) => reject(err),
              async () => {
                const downloadUrl = await getDownloadURL(storageRef);
                resolve(downloadUrl);
              }
            );
          });
        });

        const urls = await Promise.all(uploadPromises);
        finalUrls = [...urls];
      }

      // Add manual url if provided
      if (attachmentUrl.trim()) {
        finalUrls.push(attachmentUrl.trim());
      }

      if (finalUrls.length > 0) {
        singleLegacyUrl = finalUrls[0];
      }

      await onComplete(
        task,
        isText ? undefined : singleLegacyUrl,
        isText ? attachmentText : undefined,
        doerRemark,
        { 
          closePermanently: false, 
          attachment_urls: finalUrls.length > 0 ? finalUrls : undefined 
        }
      );
      
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
      setUploading(false);
    }
  };

  const isCompleteDisabled = completing || uploading || !doerRemark.trim() || 
    (task.attachment_required && task.attachment_type === 'text' && !attachmentText.trim()) ||
    (task.attachment_required && task.attachment_type !== 'text' && attachmentFiles.length === 0 && !attachmentUrl.trim());

  const totalProgress = Object.values(uploadProgresses).reduce((a, b) => a + b, 0);
  const averageProgress = attachmentFiles.length > 0 ? totalProgress / attachmentFiles.length : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="card p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">
          {task.attachment_required
            ? task.attachment_type === 'text'
              ? 'Text required to mark complete'
              : 'Upload media required to mark complete'
            : 'Mark task complete'}
        </h3>
        
        {task.attachment_required && (
          <p className="text-sm text-slate-600 mb-4">
            {task.attachment_description ||
              (task.attachment_type === 'text'
                ? 'You must enter text below to complete this task.'
                : 'Upload photos/videos or paste a link to your media.')}
          </p>
        )}
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Doer's Remark <span className="text-red-600">*</span>
          </label>
          <textarea
            value={doerRemark}
            onChange={(e) => setDoerRemark(e.target.value)}
            placeholder="Add a completion remark (required)..."
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
            disabled={completing || uploading}
          />
        </div>

        {task.attachment_required && task.attachment_type === 'text' ? (
          <textarea
            value={attachmentText}
            onChange={(e) => setAttachmentText(e.target.value)}
            placeholder="Enter your text here (required)..."
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
            required
            disabled={completing || uploading}
          />
        ) : (
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Upload photos or videos (Max 10)
              </label>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleMediaFileSelect}
                disabled={completing || uploading}
                className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 disabled:opacity-50"
              />
              
              {attachmentFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">Selected Files:</p>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {attachmentFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <span className="text-xs text-slate-600 truncate mr-2" title={f.name}>{f.name}</span>
                        {!uploading && (
                          <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {uploading && (
                    <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5">
                      <div className="bg-teal-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${averageProgress}%` }}></div>
                      <p className="text-xs text-slate-500 mt-1 text-right">{Math.round(averageProgress)}%</p>
                    </div>
                  )}
                </div>
              )}
              {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Or paste media link
              </label>
              <input
                type="url"
                value={attachmentUrl}
                onChange={(e) => {
                  setAttachmentUrl(e.target.value);
                  setUploadError(null);
                }}
                disabled={completing || uploading}
                placeholder="e.g. Google Drive, cloud link for photo/video"
                className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>
            
            {task.attachment_required && (
              <p className="text-xs text-slate-500">
                You must either upload at least one file or provide a link to mark this task complete.
              </p>
            )}
          </div>
        )}
        
        <div className="flex flex-wrap gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose} disabled={completing || uploading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCompleteDisabled}>
            {uploading ? 'Uploading...' : 'Complete'}
          </Button>
        </div>
      </div>
    </div>
  );
};
