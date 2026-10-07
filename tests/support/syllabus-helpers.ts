// Ayudas comunes de las pruebas del temario sobre el montaje del índice.
import type {
  SyllabusReview,
  Topic,
  TopicResult,
  TopicReview,
} from "@/modules/didactic-content";
import { TEACHER } from "./outline-fixture";
import type { OutlineFixture } from "./outline-fixture";

export interface SyllabusHelpers {
  review(): SyllabusReview;
  topic(title: string): Topic;
  topicReview(title: string): TopicReview;
  target(
    title: string,
    actor?: typeof TEACHER,
  ): typeof TEACHER & { topicId: string; revision: number };
  approveTopic(title: string): TopicResult;
  approveAllTopics(): void;
  approveVersion(): ReturnType<OutlineFixture["syllabus"]["approveVersion"]>;
}

export function refused(result: TopicResult): string {
  if (result.ok) {
    throw new Error("El cambio debía rechazarse.");
  }
  return result.reason;
}

export function syllabusHelpers(
  fixture: OutlineFixture,
  outlineId: string,
): SyllabusHelpers {
  const review = (): SyllabusReview => {
    const current = fixture.syllabus.review(outlineId);
    if (current === undefined) {
      throw new Error("El temario debía existir.");
    }
    return current;
  };
  const topic = (title: string): Topic => {
    const found = review().topics.find((item) => item.entry.title === title);
    if (found?.topic === undefined) {
      throw new Error(`No hay ningún tema «${title}».`);
    }
    return found.topic;
  };
  const target = (title: string, actor = TEACHER) => {
    const current = topic(title);
    return { ...actor, topicId: current.id, revision: current.revision };
  };
  const approveTopic = (title: string): TopicResult =>
    fixture.syllabus.approveTopic(target(title));
  return {
    review,
    topic,
    topicReview(title) {
      const found = fixture.syllabus.reviewTopic(topic(title).id);
      if (found === undefined) {
        throw new Error(`No hay ningún tema «${title}».`);
      }
      return found;
    },
    target,
    approveTopic,
    approveAllTopics() {
      for (const item of review().topics) {
        const result = approveTopic(item.entry.title);
        if (!result.ok) {
          throw new Error(`El tema debía aprobarse: ${result.reason}.`);
        }
      }
    },
    approveVersion() {
      return fixture.syllabus.approveVersion({
        ...TEACHER,
        outlineId,
        fingerprint: review().fingerprint,
      });
    },
  };
}
