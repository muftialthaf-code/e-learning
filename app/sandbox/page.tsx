import Link from "next/link";
import { Heading } from "../learning-ui";
import { Practice } from "./practice";

export default function Sandbox() {
  return <article className="study">
    <Link className="text-link" href="/quick">← Quick Learning</Link>
    <Heading title="Learn by retrieving">Sample lesson · Practice mode · No account or AI usage</Heading>
    <section>
      <h2>Retrieve before you reread</h2>
      <p>After reading a paragraph, close the source and explain the main idea in your own words. Then reopen the source and check the gaps. The effort of bringing an idea to mind gives you a clearer signal about what you can recall on your own.</p>
    </section>
    <section>
      <h2>Try it with an example</h2>
      <p>Suppose you’ve just read about compound interest. Set a timer for one minute and explain why the growth in the second year is larger than in the first. Check your explanation against the source, then try again tomorrow.</p>
    </section>
    <Practice />
  </article>;
}
