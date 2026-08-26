"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  File,
  FilePenLine,
  FilePlus2,
  Files,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { clientFileSchema } from "@/lib/upload";
import { letterFieldsSchema, sheetSchema } from "@/lib/validation";

type Sheet = { id: string; name: string; position: number };
type FileMeta = {
  id: string;
  kind: "letter" | "paraph" | "attachment";
  originalName: string;
  size: number;
};
type Letter = {
  id: string;
  sheetId: string;
  letterDate: string;
  sender: string;
  recipient: string;
  subject: string;
  description: string | null;
  files: FileMeta[];
};
type LetterInput = {
  sheetId: string;
  letterDate: string;
  sender: string;
  recipient: string;
  subject: string;
  description?: string;
  letterFile: FileList | undefined;
  paraph: FileList | undefined;
  attachment: FileList | undefined;
};
const optionalFile = z
  .custom<FileList | undefined>()
  .refine(
    (value) => !value?.[0] || clientFileSchema.safeParse(value[0]).success,
    "فایل نامعتبر یا بزرگ‌تر از ۱۵ مگابایت است",
  );
function formSchema(editing: boolean) {
  return letterFieldsSchema.omit({ description: true }).extend({
    description: z.string().max(4000, "توضیحات طولانی است").optional(),
    letterFile: editing
      ? optionalFile
      : optionalFile.refine((value) => Boolean(value?.[0]), "فایل نامه را انتخاب کنید"),
    paraph: optionalFile,
    attachment: optionalFile,
  });
}
async function request(url: string, method: string, body?: BodyInit) {
  const response = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body,
  });
  const result = await response.json().catch(() => ({ message: "عملیات انجام نشد" }));
  if (!response.ok) throw new Error(result.message || "عملیات انجام نشد");
  return result;
}
function FileField({
  label,
  name,
  register,
  current,
}: {
  label: string;
  name: "letterFile" | "paraph" | "attachment";
  register: ReturnType<typeof useForm<LetterInput>>["register"];
  current?: FileMeta;
}) {
  return (
    <div className="file-input">
      <label htmlFor={name}>
        <Upload size={17} />
        <span>{label}</span>
        <small>{current ? current.originalName : "PDF، تصویر، Word یا Excel · حداکثر ۱۵MB"}</small>
      </label>
      <input
        id={name}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip"
        {...register(name)}
      />
    </div>
  );
}
function LetterEditor({
  projectId,
  sheets,
  letter,
  onClose,
}: {
  projectId: string;
  sheets: Sheet[];
  letter?: Letter;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [removeFiles, setRemoveFiles] = useState<string[]>([]);
  const schema = formSchema(Boolean(letter));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LetterInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      sheetId: letter?.sheetId || sheets[0]?.id,
      letterDate: letter?.letterDate || new Date().toISOString().slice(0, 10),
      sender: letter?.sender || "",
      recipient: letter?.recipient || "",
      subject: letter?.subject || "",
      description: letter?.description || "",
    },
  });
  const submit = handleSubmit(async (values) => {
    setServerError("");
    const data = new FormData();
    for (const key of [
      "sheetId",
      "letterDate",
      "sender",
      "recipient",
      "subject",
      "description",
    ] as const)
      data.set(key, values[key] || "");
    for (const key of ["letterFile", "paraph", "attachment"] as const)
      if (values[key]?.[0]) data.set(key, values[key]![0]);
    for (const kind of removeFiles) data.set(`remove_${kind}`, "true");
    try {
      await request(
        letter
          ? `/api/projects/${projectId}/letters/${letter.id}`
          : `/api/projects/${projectId}/letters`,
        letter ? "PATCH" : "POST",
        data,
      );
      router.refresh();
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "خطا");
    }
  });
  const file = (kind: FileMeta["kind"]) => letter?.files.find((item) => item.kind === kind);
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="letter-dialog-title"
      >
        <header>
          <div>
            <h2 id="letter-dialog-title">{letter ? "ویرایش نامه" : "ثبت نامه جدید"}</h2>
            <p>اطلاعات و فایل‌های نامه را وارد کنید.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="بستن">
            <X size={19} />
          </button>
        </header>
        <form noValidate onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>شیت</label>
              <select {...register("sheetId")}>
                {sheets.map((sheet) => (
                  <option value={sheet.id} key={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </select>
              {errors.sheetId && <p className="field-error">{errors.sheetId.message}</p>}
            </div>
            <div className="field">
              <label>تاریخ نامه</label>
              <input type="date" dir="ltr" {...register("letterDate")} />
              {errors.letterDate && <p className="field-error">{errors.letterDate.message}</p>}
            </div>
            <div className="field">
              <label>فرستنده / شرکت</label>
              <input {...register("sender")} />
              {errors.sender && <p className="field-error">{errors.sender.message}</p>}
            </div>
            <div className="field">
              <label>گیرنده / شرکت</label>
              <input {...register("recipient")} />
              {errors.recipient && <p className="field-error">{errors.recipient.message}</p>}
            </div>
            <div className="field span-2">
              <label>موضوع</label>
              <input {...register("subject")} />
              {errors.subject && <p className="field-error">{errors.subject.message}</p>}
            </div>
            <div className="field span-2">
              <label>توضیحات</label>
              <textarea rows={3} {...register("description")} />
              {errors.description && <p className="field-error">{errors.description.message}</p>}
            </div>
          </div>
          <div className="upload-grid">
            <FileField
              label="فایل نامه"
              name="letterFile"
              register={register}
              current={file("letter")}
            />
            <FileField
              label="پاراف (اختیاری)"
              name="paraph"
              register={register}
              current={file("paraph")}
            />
            <FileField
              label="پیوست (اختیاری)"
              name="attachment"
              register={register}
              current={file("attachment")}
            />
          </div>
          {(["letter", "paraph", "attachment"] as const).map((kind) =>
            file(kind) && kind !== "letter" ? (
              <label className="remove-check" key={kind}>
                <input
                  type="checkbox"
                  checked={removeFiles.includes(kind)}
                  onChange={(event) =>
                    setRemoveFiles((value) =>
                      event.target.checked
                        ? [...value, kind]
                        : value.filter((item) => item !== kind),
                    )
                  }
                />{" "}
                حذف {kind === "paraph" ? "پاراف" : "پیوست"} فعلی
              </label>
            ) : null,
          )}
          {(errors.letterFile || errors.paraph || errors.attachment) && (
            <p className="field-error">
              {errors.letterFile?.message || errors.paraph?.message || errors.attachment?.message}
            </p>
          )}
          {serverError && <div className="form-alert">{serverError}</div>}
          <footer>
            <button type="button" className="secondary-button" onClick={onClose}>
              انصراف
            </button>
            <button className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "در حال ذخیره…" : letter ? "ذخیره تغییرات" : "ثبت نامه"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
function SheetCreator({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof sheetSchema>>({
    resolver: zodResolver(sheetSchema),
    defaultValues: { name: "" },
  });
  return (
    <form
      noValidate
      className="sheet-create"
      onSubmit={handleSubmit(async (values) => {
        await request(`/api/projects/${projectId}/sheets`, "POST", JSON.stringify(values));
        reset();
        onDone();
      })}
    >
      <input placeholder="نام شیت جدید" {...register("name")} />
      <button className="primary-button" disabled={isSubmitting}>
        <Plus size={16} />
        افزودن
      </button>
      {errors.name && <p className="field-error">{errors.name.message}</p>}
    </form>
  );
}
export function ProjectWorkspace({
  project,
  sheets,
  letters,
  canWrite,
}: {
  project: { id: string; name: string; code: string };
  sheets: Sheet[];
  letters: Letter[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(sheets[0]?.id || "");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Letter | "new" | null>(null);
  const [manageSheets, setManageSheets] = useState(false);
  const visible = useMemo(
    () =>
      letters
        .filter((letter) => letter.sheetId === active)
        .filter(
          (letter) =>
            !query ||
            [letter.sender, letter.recipient, letter.subject, letter.description || ""].some(
              (value) => value.toLowerCase().includes(query.toLowerCase()),
            ),
        ),
    [letters, active, query],
  );
  async function deleteLetter(letter: Letter) {
    if (!confirm("این نامه و تمام فایل‌های آن حذف شود؟")) return;
    await request(`/api/projects/${project.id}/letters/${letter.id}`, "DELETE");
    router.refresh();
  }
  async function deleteSheet(sheet: Sheet) {
    if (!confirm(`شیت «${sheet.name}» و همه نامه‌های آن حذف شود؟`)) return;
    try {
      await request(`/api/projects/${project.id}/sheets/${sheet.id}`, "DELETE");
      setActive(sheets.find((item) => item.id !== sheet.id)?.id || "");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "خطا");
    }
  }
  function fileCell(letter: Letter, kind: FileMeta["kind"]) {
    const file = letter.files.find((item) => item.kind === kind);
    return file ? (
      <a className="file-link" href={`/api/files/${file.id}`} title={file.originalName}>
        <Download size={14} />
        <span>{file.originalName}</span>
      </a>
    ) : (
      <span className="empty-cell">—</span>
    );
  }
  return (
    <>
      <div className="workspace-heading">
        <div>
          <span className="project-code">{project.code}</span>
          <h1>{project.name}</h1>
          <p>
            {letters.length.toLocaleString("fa-IR")} نامه در {sheets.length.toLocaleString("fa-IR")}{" "}
            شیت
          </p>
        </div>
        {canWrite && (
          <button className="primary-button" onClick={() => setEditor("new")}>
            <FilePlus2 size={17} />
            ثبت نامه
          </button>
        )}
      </div>
      <div className="sheet-bar">
        <div className="sheet-tabs" role="tablist">
          {sheets.map((sheet) => (
            <button
              role="tab"
              aria-selected={active === sheet.id}
              className={active === sheet.id ? "active" : ""}
              onClick={() => setActive(sheet.id)}
              key={sheet.id}
            >
              <Files size={15} />
              {sheet.name}
            </button>
          ))}
        </div>
        {canWrite && (
          <button className="sheet-manage" onClick={() => setManageSheets((value) => !value)}>
            <MoreHorizontal size={18} />
            مدیریت شیت‌ها
          </button>
        )}
      </div>
      {manageSheets && canWrite && (
        <section className="sheet-panel">
          <SheetCreator projectId={project.id} onDone={() => router.refresh()} />
          <div className="sheet-list">
            {sheets.map((sheet) => (
              <div key={sheet.id}>
                <span>
                  <Files size={15} />
                  {sheet.name}
                </span>
                <button
                  className="icon-button danger"
                  onClick={() => deleteSheet(sheet)}
                  disabled={sheets.length === 1}
                  aria-label="حذف شیت"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="table-surface">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجو در این شیت…"
            />
          </div>
          <span>{visible.length.toLocaleString("fa-IR")} مورد</span>
        </div>
        <div className="data-table-scroll">
          <table className="letters-table">
            <thead>
              <tr>
                <th className="sticky-index">ردیف</th>
                <th>لینک</th>
                <th>تاریخ نامه</th>
                <th>فرستنده / شرکت</th>
                <th>گیرنده / شرکت</th>
                <th>موضوع</th>
                <th>پاراف</th>
                <th>پیوست</th>
                <th>توضیحات</th>
                {canWrite && <th className="sticky-actions">عملیات</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((letter, index) => (
                <tr key={letter.id}>
                  <td className="sticky-index index-cell">{(index + 1).toLocaleString("fa-IR")}</td>
                  <td>{fileCell(letter, "letter")}</td>
                  <td dir="ltr">{letter.letterDate}</td>
                  <td>{letter.sender}</td>
                  <td>{letter.recipient}</td>
                  <td className="subject-column">{letter.subject}</td>
                  <td>{fileCell(letter, "paraph")}</td>
                  <td>{fileCell(letter, "attachment")}</td>
                  <td className="description-column">
                    {letter.description || <span className="empty-cell">—</span>}
                  </td>
                  {canWrite && (
                    <td className="sticky-actions">
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          onClick={() => setEditor(letter)}
                          aria-label="ویرایش"
                        >
                          <FilePenLine size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => deleteLetter(letter)}
                          aria-label="حذف"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="blank-state table-blank">
              <File size={30} />
              <h3>{query ? "نتیجه‌ای پیدا نشد" : "این شیت خالی است"}</h3>
              <p>
                {query
                  ? "عبارت جستجو را تغییر دهید."
                  : canWrite
                    ? "اولین نامه را در این شیت ثبت کنید."
                    : "هنوز نامه‌ای ثبت نشده است."}
              </p>
            </div>
          )}
        </div>
      </section>
      {editor && (
        <LetterEditor
          projectId={project.id}
          sheets={sheets}
          letter={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
