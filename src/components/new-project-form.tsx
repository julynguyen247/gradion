"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragEvent, FormEvent, KeyboardEvent, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { ArrowLeftIcon, ArrowRightIcon, BookIcon, UploadIcon } from "./icons";
import { Spinner } from "./spinner";

type Source = "paste" | "upload";

export function NewProjectForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pasteTabRef = useRef<HTMLButtonElement>(null);
  const uploadTabRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source>("paste");
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; book?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".txt")) {
      setFile(null);
      setErrors((current) => ({ ...current, book: "Choose a plain .txt file." }));
      return;
    }
    setFile(nextFile);
    setErrors((current) => ({ ...current, book: undefined }));
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  function handleSourceKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextSource: Source | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextSource = source === "paste" ? "upload" : "paste";
    } else if (event.key === "Home") {
      nextSource = "paste";
    } else if (event.key === "End") {
      nextSource = "upload";
    }

    if (!nextSource) return;
    event.preventDefault();
    setSource(nextSource);
    (nextSource === "paste" ? pasteTabRef : uploadTabRef).current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = "Give your project a title.";
    if (source === "paste" && !text.trim()) nextErrors.book = "Paste the book text to continue.";
    if (source === "upload" && !file) nextErrors.book = "Choose a .txt file to continue.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const formData = new FormData();
    formData.set("title", title.trim());
    if (source === "paste") formData.set("text", text.trim());
    else if (file) formData.set("file", file);

    setSubmitting(true);
    try {
      const { project } = await api.createProject(formData);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "We couldn't create this project." });
      setSubmitting(false);
    }
  }

  return (
    <div className="page-width page-pad form-page">
      <Link className="back-link" href="/projects"><ArrowLeftIcon /> Back to projects</Link>
      <div className="form-page-heading">
        <p className="eyebrow">New project</p>
        <h1>Bring your story into view.</h1>
        <p>Add a title and the complete book text. We’ll save it once and reuse the same context through all five steps.</p>
      </div>
      <form className="new-project-card" onSubmit={submit} noValidate>
        <div className="field-group">
          <div className="field-label-row"><label htmlFor="project-title">Project title</label><span>{title.length}/120</span></div>
          <input id="project-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The Wind in the Willows" maxLength={120} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined} autoFocus />
          {errors.title && <p className="field-error" id="title-error">{errors.title}</p>}
        </div>

        <fieldset className="source-fieldset">
          <legend>Book text</legend>
          <div className="source-tabs" role="tablist" aria-label="Book text source">
            <button ref={pasteTabRef} id="paste-source-tab" type="button" role="tab" aria-controls="paste-source-panel" aria-selected={source === "paste"} tabIndex={source === "paste" ? 0 : -1} className={source === "paste" ? "is-active" : ""} onClick={() => setSource("paste")} onKeyDown={handleSourceKeyDown}><BookIcon /> Paste text</button>
            <button ref={uploadTabRef} id="upload-source-tab" type="button" role="tab" aria-controls="upload-source-panel" aria-selected={source === "upload"} tabIndex={source === "upload" ? 0 : -1} className={source === "upload" ? "is-active" : ""} onClick={() => setSource("upload")} onKeyDown={handleSourceKeyDown}><UploadIcon /> Upload .txt</button>
          </div>
          {source === "paste" ? (
            <div id="paste-source-panel" role="tabpanel" aria-labelledby="paste-source-tab" className="source-panel">
              <label className="sr-only" htmlFor="book-text">Paste book text</label>
              <textarea id="book-text" value={text} onChange={(event) => setText(event.target.value)} rows={12} placeholder="Once upon a time…" aria-invalid={Boolean(errors.book)} aria-describedby={errors.book ? "book-error" : "book-note"} />
              {!errors.book && <p className="field-note" id="book-note">Plain text works best. The full text remains readable from the project page.</p>}
            </div>
          ) : (
            <div id="upload-source-panel" role="tabpanel" aria-labelledby="upload-source-tab" className="source-panel">
              <div className={`dropzone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
                <input ref={inputRef} id="book-file" type="file" accept=".txt,text/plain" aria-label="Book text .txt file" tabIndex={-1} onChange={(event) => chooseFile(event.target.files?.[0])} />
                <span className="dropzone-icon"><UploadIcon /></span>
                {file ? <><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB ready to use</span></> : <><strong>Drop your .txt file here</strong><span>or choose it from your computer</span></>}
                <button className="button button-secondary button-small" type="button" onClick={() => inputRef.current?.click()}>{file ? "Choose another file" : "Choose file"}</button>
              </div>
            </div>
          )}
          {errors.book && <p className="field-error" id="book-error">{errors.book}</p>}
        </fieldset>

        {errors.form && <div className="form-alert" role="alert">{errors.form}</div>}
        <div className="form-actions">
          <Link className="button button-ghost" href="/projects">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? <><Spinner label="Creating project" /> Creating project…</> : <>Create project <ArrowRightIcon /></>}</button>
        </div>
      </form>
    </div>
  );
}
