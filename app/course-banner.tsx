"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";

export type SuggestedCourse = {
  title: string;
  publisher: string;
  description: string;
  href: string;
  saved?: boolean;
};

export function CourseBanner({ courses }: { courses: SuggestedCourse[] }) {
  const [selected, setSelected] = useState(0);
  const index = selected % courses.length;
  const course = courses[index];

  function move(direction: number) {
    setSelected(current => (current + direction + courses.length) % courses.length);
  }

  return <section className="course-feature" aria-labelledby="suggested-courses">
    <div className="course-hero">
      <Image className="hero-image" src="/learning-glass.webp" alt="" fill sizes="(max-width: 640px) 100vw, 900px" preload />
      <div className="hero-copy">
        <h2 className="hero-label" id="suggested-courses"><Sparkles size={15} aria-hidden="true" /> Suggested courses</h2>
        <div aria-live="polite" aria-atomic="true">
          <p className="hero-publisher">{course.publisher}</p>
          <h3>{course.title}</h3>
          <p className="hero-description">{course.description}</p>
        </div>
        {course.saved
          ? <Link className="button hero-button" href={course.href}>Open study plan <ArrowRight size={17} aria-hidden="true" /></Link>
          : <a className="button hero-button" href={course.href} target="_blank" rel="noreferrer" aria-label={`Explore ${course.title} (opens in a new tab)`}>Explore course <ArrowUpRight size={17} aria-hidden="true" /></a>}
      </div>
      <div className="hero-navigation">
        <button className="glass hero-arrow" type="button" onClick={() => move(-1)} aria-label="Previous course"><ArrowLeft size={18} aria-hidden="true" /></button>
        <button className="glass hero-arrow" type="button" onClick={() => move(1)} aria-label="Next course"><ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="course-options" aria-label="Choose a suggested course" role="group">
      {courses.map((item, position) => <button type="button" key={item.href} className="glass course-option" aria-pressed={position === index} onClick={() => setSelected(position)}>
        <span className="option-dot" aria-hidden="true" /><span>{item.title}</span>
      </button>)}
    </div>
  </section>;
}
