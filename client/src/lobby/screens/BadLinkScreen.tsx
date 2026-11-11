export interface BadLinkScreenProps {
  onHome(): void;
}

export function BadLinkScreen({ onHome }: BadLinkScreenProps) {
  return (
    <section data-testid="bad-link-screen">
      <h2>Комната не найдена или ссылка устарела</h2>
      <button type="button" data-testid="home-button" onClick={onHome}>
        Создать свою игру
      </button>
    </section>
  );
}
