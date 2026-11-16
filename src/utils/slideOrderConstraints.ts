import type { SlideOrderPlacement } from '../types/annotation.types';

export interface SlideOrderConstraint {
  slideId: string;
  anchorSlideId: string;
  placement: SlideOrderPlacement;
}

export interface ResolvedSlideOrder<T> {
  slides: T[];
  conflict: boolean;
}

export function resolveSlideOrder<T extends { id: string }>(
  slides: T[],
  constraints: SlideOrderConstraint[],
): ResolvedSlideOrder<T> {
  const slideById = new Map(slides.map((slide) => [slide.id, slide]));
  const baseIndex = new Map(slides.map((slide, index) => [slide.id, index]));
  const movedIds = new Set(
    constraints
      .filter(({ slideId, anchorSlideId }) => (
        slideId !== anchorSlideId && slideById.has(slideId) && slideById.has(anchorSlideId)
      ))
      .map(({ slideId }) => slideId),
  );
  const edges = new Map(slides.map((slide) => [slide.id, new Set<string>()]));
  const indegree = new Map(slides.map((slide) => [slide.id, 0]));

  const addEdge = (from: string, to: string) => {
    const outgoing = edges.get(from);
    if (!outgoing || outgoing.has(to)) return;
    outgoing.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };

  const unaffectedIds = slides.map((slide) => slide.id).filter((id) => !movedIds.has(id));
  for (let index = 0; index < unaffectedIds.length - 1; index += 1) {
    addEdge(unaffectedIds[index]!, unaffectedIds[index + 1]!);
  }

  for (const constraint of constraints) {
    if (constraint.slideId === constraint.anchorSlideId
      || !slideById.has(constraint.slideId)
      || !slideById.has(constraint.anchorSlideId)) continue;
    if (constraint.placement === 'before') addEdge(constraint.slideId, constraint.anchorSlideId);
    else addEdge(constraint.anchorSlideId, constraint.slideId);
  }

  const validConstraints = constraints.filter(({ slideId, anchorSlideId }) => (
    slideId !== anchorSlideId && slideById.has(slideId) && slideById.has(anchorSlideId)
  ));
  // A moved slide with an 'after' constraint belongs right behind its anchor,
  // so it is placed as soon as its anchors are. A moved slide with only
  // 'before' constraints is held back until one of its anchors is about to be
  // placed. Without these rules the original order wins every tie, and a slide
  // moved forward with 'before' or backward with 'after' never moves.
  const placesAfterAnchor = new Set(
    validConstraints.filter(({ placement }) => placement === 'after').map(({ slideId }) => slideId),
  );
  const byBaseOrder = (left: string, right: string) => (baseIndex.get(left) ?? 0) - (baseIndex.get(right) ?? 0);

  const available = new Set(slides.map((slide) => slide.id).filter((id) => indegree.get(id) === 0));
  const placed = new Set<string>();
  const orderedIds: string[] = [];

  const pickNext = (): string | undefined => {
    const ready = [...available].sort(byBaseOrder);
    const followsAnchor = ready.find((id) => placesAfterAnchor.has(id));
    if (followsAnchor) return followsAnchor;

    const deferred = ready.filter((id) => movedIds.has(id));
    const deferredSet = new Set(deferred);
    // Slides that are ready, or blocked only by deferred 'before' slides.
    const blockedOnlyByDeferred = (id: string) => {
      if (placed.has(id) || available.has(id)) return false;
      const blockers = deferred.filter((candidate) => edges.get(candidate)?.has(id)).length;
      return blockers > 0 && blockers === indegree.get(id);
    };
    const upcoming = slides
      .map((slide) => slide.id)
      .filter((id) => (available.has(id) && !deferredSet.has(id)) || blockedOnlyByDeferred(id))
      .sort(byBaseOrder)[0];
    if (upcoming === undefined) return deferred[0];
    if (available.has(upcoming)) return upcoming;
    return deferred.find((id) => edges.get(id)?.has(upcoming));
  };

  for (let id = pickNext(); id !== undefined; id = pickNext()) {
    available.delete(id);
    placed.add(id);
    orderedIds.push(id);
    for (const target of edges.get(id) ?? []) {
      const nextIndegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) available.add(target);
    }
  }

  if (orderedIds.length !== slides.length) return { slides, conflict: true };
  return {
    slides: orderedIds.map((id) => slideById.get(id)!).filter(Boolean),
    conflict: false,
  };
}
