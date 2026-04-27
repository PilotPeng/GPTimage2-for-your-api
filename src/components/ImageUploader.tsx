import { useEffect, useMemo, useState } from "react";

type ImageUploaderProps = Readonly<{
  value: readonly File[];
  allowedTypes: readonly string[];
  maxBytes: number;
  maxCount: number;
  maxTotalBytes: number;
  onChange: (files: File[]) => void;
}>;

type PreviewImageProps = Readonly<{
  file: File;
  index: number;
  onRemove: () => void;
}>;

const formatBytes = (bytes: number) => {
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
};

function PreviewImage({ file, index, onRemove }: PreviewImageProps) {
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  return (
    <div className="upload-preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt={`上传预览 ${index + 1}`} />
      <div>
        <strong>{file.name}</strong>
        <span>{formatBytes(file.size)}</span>
        <button type="button" className="secondary-button" onClick={onRemove}>
          移除图片
        </button>
      </div>
    </div>
  );
}

export function ImageUploader({ value, allowedTypes, maxBytes, maxCount, maxTotalBytes, onChange }: ImageUploaderProps) {
  const accept = allowedTypes.join(",");
  const totalBytes = useMemo(() => value.reduce((total, file) => total + file.size, 0), [value]);

  const updateSelectedFiles = (files: readonly File[]) => {
    onChange([...files]);
  };

  const removeFile = (index: number) => {
    updateSelectedFiles(value.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="field-group">
      <label htmlFor="image">上传图片</label>
      <input
        id="image"
        name="image"
        type="file"
        accept={accept}
        multiple
        onChange={(event) => updateSelectedFiles(Array.from(event.target.files ?? []))}
      />
      <p className="field-help">
        支持 {allowedTypes.join("、")}，最多 {maxCount} 张；单张最大 {formatBytes(maxBytes)}，总大小最大 {formatBytes(maxTotalBytes)}。
      </p>
      {value.length > 0 ? (
        <div className="upload-preview-list">
          <div className="upload-preview-summary">
            <strong>已选择 {value.length} 张图片</strong>
            <span>总大小 {formatBytes(totalBytes)}</span>
            <button type="button" className="secondary-button" onClick={() => updateSelectedFiles([])}>
              清空全部
            </button>
          </div>
          <div className="upload-preview-grid">
            {value.map((file, index) => (
              <PreviewImage
                file={file}
                index={index}
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                onRemove={() => removeFile(index)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
