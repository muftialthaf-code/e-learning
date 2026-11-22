"use client";

import { useState, type FormEvent } from "react";

const choices = [
  "Read the chapter again immediately.",
  "Close the book and reconstruct the argument from memory.",
  "Highlight every key term in the chapter.",
  "Copy the chapter summary into your notes.",
];

export function Practice() {
  const [answer, setAnswer] = useState<number | null>(null);
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnswer(Number(new FormData(event.currentTarget).get("answer")));
  }
  return <section>
    <h2>Knowledge check</h2>
    <form onSubmit={check}>
      <fieldset><legend>Which activity directly tests retrieval?</legend>
        {choices.map((choice, index) => <label key={choice} className="check">
          <input type="radio" name="answer" value={index} required /> {choice}
        </label>)}
      </fieldset>
      <button className="button">Check answer</button>
    </form>
    {answer !== null && <p role="status">{answer === 1 ? "Correct. " : "Try again. "}Retrieval means producing an answer from memory before checking the source.</p>}
  </section>;
}
