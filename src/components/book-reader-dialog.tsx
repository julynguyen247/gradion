"use client";

import { useRef } from "react";
import { BookIcon, CloseIcon } from "./icons";

export function BookReaderDialog({ title, text }: { title: string; text: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="button button-secondary button-small" type="button" onClick={() => dialogRef.current?.showModal()}><BookIcon /> Read full text</button>
      <dialog ref={dialogRef} className="book-dialog" aria-labelledby="book-dialog-title">
        <div className="dialog-header">
          <div><p className="eyebrow">Original book text</p><h2 id="book-dialog-title">{title}</h2></div>
          <button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close book text"><CloseIcon /></button>
        </div>
        <div className="book-dialog-body"><p>{text}</p></div>
      </dialog>
    </>
  );
}
