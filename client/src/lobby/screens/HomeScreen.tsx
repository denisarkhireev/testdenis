import { NameForm } from './NameForm';

export interface HomeScreenProps {
  canSubmit: boolean;
  error: string | null;
  onCreate(name: string): void;
}

export function HomeScreen({ canSubmit, error, onCreate }: HomeScreenProps) {
  return (
    <section data-testid="home-screen">
      <h2>Новая игра</h2>
      <NameForm
        submitLabel="Создать игру"
        submitTestId="create-button"
        canSubmit={canSubmit}
        error={error}
        onSubmit={onCreate}
      />
    </section>
  );
}
