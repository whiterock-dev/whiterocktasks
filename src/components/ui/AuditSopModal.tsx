import React, { useState, useRef, useEffect } from 'react';
import { Task, User, UserRole } from '../../types';
import { api } from '../../services/api';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { Button } from './Button';
import { compressImageForUpload } from '../../lib/utils';
import { FileText, Paperclip, X, Pencil, Link as LinkIcon } from 'lucide-react';
import { AttachmentViewerModal } from './AttachmentViewerModal';

interface AuditSopModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  
  // Edit existing task mode
  task?: Task;
  onUpdate?: () => void;
  
  // Create task mode (AssignTask)
  initialText?: string;
  initialFiles?: File[];
  initialLinks?: string[];
  onSaveAssign?: (text: string, files: File[], links: string[]) => void;
}

const linkify = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-600 hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
};

const DEFAULT_FILES: File[] = [];
const DEFAULT_LINKS: string[] = [''];

export const AuditSopModal: React.FC<AuditSopModalProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  task, 
  onUpdate,
  initialText = '',
  initialFiles = DEFAULT_FILES,
  initialLinks = DEFAULT_LINKS,
  onSaveAssign
}) => {
  const isAssignMode = !task && !!onSaveAssign;
  const isAssigner = task ? user.id === task.assigned_by_id : true;
  const isAdmin = user.role === UserRole.OWNER || user.role === UserRole.MANAGER;
  const canEdit = isAssignMode || ((isAssigner || isAdmin) && !task?.verified_at);
  
  const hasContent = isAssignMode 
    ? (!!initialText || initialFiles.length > 0 || initialLinks.filter(l => l.trim()).length > 0)
    : (!!task?.audit_sop_text || (task?.audit_sop_attachments && task.audit_sop_attachments.length > 0) || (task?.audit_sop_links && task.audit_sop_links.length > 0));

  const [isEditing, setIsEditing] = useState(isAssignMode || (canEdit && !hasContent));
  
  const [text, setText] = useState(isAssignMode ? initialText : (task?.audit_sop_text || ''));
  const [existingFiles, setExistingFiles] = useState(isAssignMode ? [] : (task?.audit_sop_attachments || []));
  const [newFiles, setNewFiles] = useState<File[]>(isAssignMode ? initialFiles : []);
  const [links, setLinks] = useState<string[]>(isAssignMode ? initialLinks : (task?.audit_sop_links?.length ? task.audit_sop_links : ['']));
  
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgresses, setUploadProgresses] = useState<{ [key: string]: number }>({});
  
  const [viewAttachment, setViewAttachment] = useState<{ urls: string[]; text?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (isAssignMode) {
        setText(initialText);
        setNewFiles(initialFiles);
        setLinks(initialLinks.length ? initialLinks : ['']);
        setIsEditing(true);
      } else {
        setText(task?.audit_sop_text || '');
        setExistingFiles(task?.audit_sop_attachments || []);
        setNewFiles([]);
        setLinks(task?.audit_sop_links?.length ? task.audit_sop_links : ['']);
        const contentExists = !!task?.audit_sop_text || (task?.audit_sop_attachments && task.audit_sop_attachments.length > 0) || (task?.audit_sop_links && task.audit_sop_links.length > 0);
        setIsEditing(canEdit && !contentExists);
      }
      setUploadError(null);
      setIsSaving(false);
      setUploadProgresses({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task?.id]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadError(null);

    const currentCount = existingFiles.length + newFiles.length;
    const newCount = currentCount + files.length;
    
    if (newCount > 5) {
      setUploadError('Maximum 5 attachments allowed.');
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

    setNewFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeNewFile = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index: number) => {
    setExistingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const validLinks = links.map(l => l.trim()).filter(l => l !== '');
    
    // In assign mode, empty save is allowed to clear the SOP.
    if (!isAssignMode && !text.trim() && existingFiles.length === 0 && newFiles.length === 0 && validLinks.length === 0) {
      setUploadError('Please provide text, attachment or a link.');
      return;
    }
    
    if (isAssignMode && onSaveAssign) {
      onSaveAssign(text, newFiles, validLinks.length > 0 ? validLinks : ['']);
      onClose();
      return;
    }
    
    if (!task) return;

    setIsSaving(true);
    setUploadError(null);
    
    try {
      let uploadedAttachments = [...existingFiles];
      
      if (newFiles.length > 0) {
        const uploadPromises = newFiles.map(async (file, index) => {
          const fileId = `${Date.now()}_${index}_${file.name}`;
          const path = `task-audit-attachments/${task.id}/${fileId}`;
          const storageRef = ref(storage, path);
          
          const toUpload = file.type.startsWith('image/') ? await compressImageForUpload(file) : file;
          const uploadTask = uploadBytesResumable(storageRef, toUpload);

          return new Promise<NonNullable<Task['audit_sop_attachments']>[0]>((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgresses((prev) => ({ ...prev, [file.name]: progress }));
              },
              (err) => reject(err),
              async () => {
                const downloadUrl = await getDownloadURL(storageRef);
                resolve({
                  file_url: downloadUrl,
                  file_type: file.type,
                  file_name: file.name,
                  size: file.size,
                  uploaded_by: user.name || user.id,
                  uploaded_at: new Date().toISOString(),
                });
              }
            );
          });
        });

        const newUploaded = await Promise.all(uploadPromises);
        uploadedAttachments = [...uploadedAttachments, ...newUploaded];
      }

      await api.updateTask(task.id, {
        audit_sop_text: text.trim() || undefined,
        audit_sop_attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        audit_sop_links: validLinks.length > 0 ? validLinks : undefined,
        audit_sop_updated_by: user.name || user.id,
        audit_sop_updated_at: new Date().toISOString(),
      }, { id: user.id, name: user.name, role: user.role }, 'Updated Guidelines to Audit field');

      setIsEditing(false);
      setNewFiles([]);
      setUploadProgresses({});
      if (onUpdate) onUpdate();
      onClose();

    } catch (err: any) {
      setUploadError(err?.message || 'Failed to save guidelines');
    } finally {
      setIsSaving(false);
    }
  };

  const totalProgress = Object.values(uploadProgresses).reduce((a, b) => a + b, 0);
  const averageProgress = newFiles.length > 0 ? totalProgress / newFiles.length : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-xl">
          <div className="flex items-center gap-2">
            <FileText className="text-teal-600" size={20} />
            <h3 className="text-lg font-semibold text-slate-800">Guidelines to Audit</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {!isEditing && canEdit && hasContent && (
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-sm text-teal-600 hover:text-teal-800 font-medium px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors inline-flex items-center gap-1 border border-teal-200"
              >
                <Pencil size={14} /> Edit Guidelines
              </button>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-6">
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe how this task should be checked — what to look at, what counts as done."
                  disabled={isSaving}
                  className="w-full text-sm rounded-lg border border-slate-300 px-3 py-3 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white resize-y min-h-[100px]"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-xs text-slate-400">{text.length}/2000</span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">Links (Max 3)</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (links.length < 3) setLinks([...links, '']);
                    }}
                    disabled={isSaving || links.length >= 3}
                    className="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 font-medium shadow-sm transition-colors"
                  >
                    <LinkIcon size={14} /> Add Link
                  </button>
                </div>
                <div className="space-y-2">
                  {links.map((link, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => {
                          const newLinks = [...links];
                          newLinks[i] = e.target.value;
                          setLinks(newLinks);
                        }}
                        disabled={isSaving}
                        placeholder="https://example.com"
                        className="flex-1 text-sm rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                      />
                      {links.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
                          disabled={isSaving}
                          className="text-slate-400 hover:text-red-500 p-2"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">Attachments (Max 5, 10MB each - JPG, PNG, PDF)</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving || (existingFiles.length + newFiles.length >= 5)}
                    className="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 font-medium shadow-sm transition-colors"
                  >
                    <Paperclip size={14} /> Add File
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".jpg,.jpeg,.png,.pdf"
                    multiple
                    className="hidden"
                  />
                </div>
                
                <div className="space-y-2">
                  {existingFiles.map((f, i) => (
                    <div key={`ext-${i}`} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Paperclip size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate text-slate-700 font-medium" title={f.file_name || 'Attachment'}>{f.file_name || 'Attachment'}</span>
                      </div>
                      <button type="button" onClick={() => removeExistingFile(i)} disabled={isSaving} className="text-slate-400 hover:text-red-500 ml-2 flex-shrink-0 p-1 hover:bg-red-50 rounded">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {newFiles.map((f, i) => (
                    <div key={`new-${i}`} className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="bg-teal-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">NEW</span>
                        <span className="truncate text-teal-800 font-medium" title={f.name}>{f.name}</span>
                      </div>
                      <button type="button" onClick={() => removeNewFile(i)} disabled={isSaving} className="text-teal-600 hover:text-red-600 ml-2 flex-shrink-0 p-1 hover:bg-red-50 rounded">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                
                {isSaving && newFiles.length > 0 && (
                  <div className="mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-teal-600 h-2 rounded-full transition-all duration-300" style={{ width: `${averageProgress}%` }}></div>
                  </div>
                )}
                
                {uploadError && <p className="text-sm text-red-600 mt-2 font-medium bg-red-50 p-2 rounded">{uploadError}</p>}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-6">
                <div>
                  {isAssignMode && (text || newFiles.length > 0 || links.some(l => l.trim())) && (
                    <button
                      type="button"
                      onClick={() => {
                        setText('');
                        setNewFiles([]);
                        setLinks(['']);
                      }}
                      disabled={isSaving}
                      className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition-colors font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => {
                    if (isAssignMode) {
                      onClose();
                    } else {
                      setIsEditing(false);
                      setNewFiles([]);
                      setLinks(task?.audit_sop_links?.length ? task.audit_sop_links : ['']);
                      setUploadError(null);
                    }
                  }} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Guidelines'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {!task?.audit_sop_text && (!task?.audit_sop_attachments || task.audit_sop_attachments.length === 0) && (!task?.audit_sop_links || task.audit_sop_links.length === 0) ? (
                 <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                   <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                   <h3 className="text-sm font-medium text-slate-900">No Guidelines Set</h3>
                   <p className="mt-1 text-sm text-slate-500">
                     There are no specific instructions for auditing this task.
                   </p>
                 </div>
              ) : (
                <>
                  {task?.audit_sop_text && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 mb-2">Instructions</h4>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border border-slate-200">
                        {linkify(task.audit_sop_text)}
                      </div>
                    </div>
                  )}
                  
                  {task?.audit_sop_links && task.audit_sop_links.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 mb-2">Links</h4>
                      <div className="flex flex-col gap-2">
                        {task.audit_sop_links.map((link, i) => (
                          <a
                            key={i}
                            href={link.startsWith('http') ? link : `https://${link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-teal-600 hover:text-teal-800 hover:underline break-all bg-teal-50 p-3 rounded-lg border border-teal-100 flex items-center gap-2 transition-colors"
                          >
                            <LinkIcon size={14} className="flex-shrink-0" />
                            <span className="truncate">{link}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {task?.audit_sop_attachments && task.audit_sop_attachments.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 mb-2">Attachments</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {task.audit_sop_attachments.map((att, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setViewAttachment({ urls: [att.file_url] })}
                            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all text-left shadow-sm group"
                            title={att.file_name}
                          >
                            <div className="bg-slate-100 p-2 rounded-md group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                              <Paperclip size={16} />
                            </div>
                            <span className="truncate flex-1 font-medium">{att.file_name || 'Attachment'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {task?.audit_sop_updated_by && task?.audit_sop_updated_at && (
                    <div className="text-xs text-slate-500 text-right mt-4 pt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                      <span>Last updated by</span>
                      <span className="font-medium text-slate-700">{task.audit_sop_updated_by}</span>
                      <span>on</span>
                      <span className="font-medium text-slate-700">
                        {new Date(task.audit_sop_updated_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {viewAttachment && (
        <AttachmentViewerModal
          urls={viewAttachment.urls}
          text={viewAttachment.text}
          onClose={() => setViewAttachment(null)}
        />
      )}
    </div>
  );
};
