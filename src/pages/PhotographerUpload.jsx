import React, { useState, useEffect, useRef } from 'react';
import { getEvent, uploadFile, addPhoto } from '../store.js';

const PhotographerUpload = ({ eventCode, toast }) => {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
      const { data } = await getEvent(eventCode);
      setEvent(data);
      setLoading(false);
    })();
  }, [eventCode]);

  const handleFilesSelected = (selectedFiles) => {
    const fileList = [...selectedFiles].filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    ).slice(0, 50);
    setFiles(fileList);
    setProgress({});
  };

  const handleUploadAll = async () => {
    if (!event || files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = file.name + i;
      setProgress((prev) => ({ ...prev, [key]: 'uploading' }));

      try {
        const { publicUrl, error: uploadError } = await uploadFile(event.id, file);
        if (uploadError || !publicUrl) {
          setProgress((prev) => ({ ...prev, [key]: 'failed' }));
          continue;
        }

        const isVideo = file.type.startsWith('video/');
        const takenAt = new Date(file.lastModified);

        const { error: dbError } = await addPhoto({
          event_id: event.id,
          file_url: publicUrl,
          guest_name: 'Photographer',
          media_type: isVideo ? 'video' : 'photo',
          taken_at: takenAt.toISOString(),
          moderation_status: 'approved',
        });

        setProgress((prev) => ({ ...prev, [key]: dbError ? 'failed' : 'done' }));
      } catch {
        setProgress((prev) => ({ ...prev, [key]: 'failed' }));
      }
    }

    setUploading(false);
  };

  const backButton = (
    <button
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.hash = '#/';
      }}
      aria-label="Back"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        minWidth: 44,
        minHeight: 44,
        padding: '0 18px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: 22,
        color: 'var(--charcoal)',
        fontSize: '0.85rem',
        fontFamily: "'Jost', sans-serif",
        lineHeight: 1,
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        zIndex: 1000,
      }}
    >
      ← Back
    </button>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        {backButton}
        <div className="loader" />
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {backButton}
        <div style={{ textAlign: 'center' }}>
          <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>Event not found</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Check the URL and try again.</p>
        </div>
      </div>
    );
  }

  if (event.plan !== 'premium' && event.plan !== 'premium_max') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {backButton}
        <div style={{ textAlign: 'center' }}>
          <h2 className="serif" style={{ fontSize: '2rem', fontWeight: 300, marginBottom: 8 }}>Premium Feature</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Photographer access requires a Premium event.</p>
        </div>
      </div>
    );
  }

  const doneCount = Object.values(progress).filter((s) => s === 'done').length;
  const failedCount = Object.values(progress).filter((s) => s === 'failed').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      {backButton}
      <div style={{ background: 'var(--charcoal)', padding: '48px 24px 40px', textAlign: 'center', color: 'white' }}>
        <span className="badge" style={{ background: 'rgba(201,168,76,0.15)', color: 'var(--gold-light)', marginBottom: 16 }}>✦ Photographer Upload</span>
        <h1 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 300, marginBottom: 8 }}>{event.title}</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 300, fontSize: '0.9rem' }}>Professional photo upload — up to 50 files at once</p>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ background: 'white', borderRadius: 6, padding: 32, boxShadow: 'var(--shadow)' }}>
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            style={{ padding: '50px 20px', textAlign: 'center', cursor: 'pointer', borderRadius: 8, marginBottom: 20 }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilesSelected(e.dataTransfer.files); }}
          >
            <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.5 }}>📷</div>
            <p style={{ fontSize: '1rem', color: 'var(--charcoal)', marginBottom: 4 }}>
              {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''} selected` : 'Drop files here or click to select'}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Up to 50 photos and videos · JPG, PNG, HEIC, MP4, MOV</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => handleFilesSelected(e.target.files)}
            style={{ display: 'none' }}
          />

          {/* File list with progress */}
          {files.length > 0 && (
            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 20, border: '1px solid var(--border)', borderRadius: 4 }}>
              {files.map((file, i) => {
                const key = file.name + i;
                const status = progress[key];
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>{file.name}</span>
                    <span style={{ fontSize: '0.72rem', flexShrink: 0, color: status === 'done' ? '#276749' : status === 'failed' ? '#c53030' : status === 'uploading' ? 'var(--gold)' : 'var(--muted)' }}>
                      {status === 'done' ? 'Done' : status === 'failed' ? 'Failed' : status === 'uploading' ? 'Uploading...' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {Object.keys(progress).length > 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16 }}>
              {doneCount} uploaded{failedCount > 0 ? `, ${failedCount} failed` : ''}
            </p>
          )}

          <button
            className="btn-gold"
            onClick={handleUploadAll}
            disabled={uploading || files.length === 0}
            style={{ width: '100%', padding: '14px', borderRadius: 3 }}
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotographerUpload;
