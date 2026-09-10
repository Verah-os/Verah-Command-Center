import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleCheck,
  HeartHandshake,
  Network,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { VerahLogo } from "@/components/brand/verah-logo";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "VERAH | Confiança para cuidar do seu carro",
  description:
    "Cuidado automotivo com alguém do seu lado. Entenda o orçamento, acompanhe cada etapa e decida com confiança. Conheça a VERAH e experimente a demo.",
};

const steps = [
  [
    "Conte para a VERAH",
    "Uma dúvida, um barulho, uma revisão. Comece contando o que seu carro precisa, do seu jeito.",
  ],
  [
    "A gente cuida do caminho",
    "O concierge organiza as informações e conecta você à rede de serviços.",
  ],
  [
    "Você acompanha e decide",
    "Entenda o que foi proposto e aprove o escopo e o valor antes de qualquer serviço.",
  ],
  [
    "Seu carro volta para você",
    "Acompanhe a conclusão e mantenha o histórico do cuidado. Leva & traz quando disponível.",
  ],
];
const pillars = [
  {
    icon: HeartHandshake,
    title: "Alguém do seu lado",
    text: "Um concierge acompanha a jornada e ajuda você a entender o próximo passo.",
  },
  {
    icon: ShieldCheck,
    title: "Rede de confiança",
    text: "Conexão com prestadores e informações organizadas para apoiar sua escolha.",
  },
  {
    icon: CircleCheck,
    title: "Transparência para decidir",
    text: "Escopo e orçamento claros. Mudou o combinado? Uma nova aprovação é necessária.",
  },
  {
    icon: Route,
    title: "Leva & traz",
    text: "Mais conveniência quando disponível, com autorização e acompanhamento da retirada à entrega.",
  },
];
const flow = [
  "Cliente + veículo",
  "VERAH Intelligence",
  "Concierge",
  "Rede VERAH",
  "Serviço",
  "Histórico atualizado",
];

export default function HomePage() {
  return (
    <div className={styles.home}>
      <a className={styles.skip} href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className={styles.header}>
        <div className={styles.navbar}>
          <Link href="/" aria-label="VERAH — início">
            <VerahLogo tone="dark" size="sm" priority />
          </Link>
          <nav aria-label="Navegação principal" className={styles.nav}>
            <a href="#como-funciona">Como funciona</a>
            <a href="#inteligencia">Nossa tecnologia</a>
            <Link href="/demo" className={styles.navCta} prefetch={false}>
              Ver demonstração <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>
      <main id="conteudo">
        <section
          className={`${styles.container} ${styles.hero}`}
          aria-labelledby="hero-title"
        >
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.dot} /> Cuidado automotivo, com você no
              centro
            </p>
            <h1 id="hero-title">
              Seu carro precisa de cuidado?
              <br />
              <span>A VERAH cuida do resto.</span>
            </h1>
            <p className={styles.lead}>
              Você não precisa entender de carro. Precisa saber que tem alguém
              do seu lado.
            </p>
            <p className={styles.support}>
              Do primeiro sinal à conclusão do serviço, a VERAH conecta você ao
              cuidado certo, com acompanhamento e clareza para decidir.
            </p>
            <div className={styles.actions}>
              <Link
                href="/entrar/cliente"
                prefetch={false}
                className={styles.primary}
              >
                Preciso de ajuda <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/demo" prefetch={false} className={styles.secondary}>
                Ver demonstração
              </Link>
            </div>
            <p className={styles.note}>
              Já pode conhecer a experiência na demo. Para seus atendimentos,
              acesse sua conta.
            </p>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.visualHeading}>
              <span>DO SEU LADO, EM CADA ETAPA</span>
              <Sparkles size={20} aria-hidden="true" />
            </div>
            <div className={styles.orbit} aria-hidden="true">
              <div />
              <div />
              <div />
              <span>
                <VerahLogo kind="symbol" tone="dark" size="lg" />
              </span>
            </div>
            <div className={styles.journeyCard}>
              <span className={styles.smallLabel}>UMA JORNADA COM CLAREZA</span>
              <h2>
                Menos dúvidas.
                <br />
                Mais tranquilidade.
              </h2>
              <ul>
                <li>
                  <Check size={17} aria-hidden="true" /> Você conta o que
                  precisa
                </li>
                <li>
                  <Check size={17} aria-hidden="true" /> A VERAH organiza o
                  caminho
                </li>
                <li>
                  <Check size={17} aria-hidden="true" /> A decisão continua com
                  você
                </li>
              </ul>
            </div>
            <p className={styles.visualFooter}>
              <ShieldCheck size={18} aria-hidden="true" /> Cuidado humano.
              Tecnologia a seu favor.
            </p>
          </div>
        </section>
        <section className={styles.problem} aria-labelledby="problem-title">
          <div className={`${styles.container} ${styles.problemInner}`}>
            <p className={styles.eyebrow}>A gente entende</p>
            <h2 id="problem-title">
              Cuidar do carro não deveria
              <br />
              pesar na sua rotina.
            </h2>
            <p>
              É difícil saber em quem confiar, entender um orçamento e encontrar
              tempo para resolver tudo. A VERAH reúne orientação, conexão e
              acompanhamento para você não precisar coordenar cada detalhe
              sozinha.
            </p>
          </div>
        </section>
        <section
          id="como-funciona"
          className={`${styles.container} ${styles.section}`}
          aria-labelledby="steps-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Do “e agora?” ao “resolvido”</p>
              <h2 id="steps-title">
                Um caminho simples.
                <br />
                Do começo ao fim.
              </h2>
            </div>
            <a href="#produto" className={styles.textLink}>
              Conheça a experiência <ArrowDown size={18} aria-hidden="true" />
            </a>
          </div>
          <ol className={styles.steps}>
            {steps.map(([title, text], index) => (
              <li key={title}>
                <span className={styles.stepNumber}>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          className={`${styles.container} ${styles.trust}`}
          aria-labelledby="trust-title"
        >
          <p className={styles.eyebrow}>Confiança em cada escolha</p>
          <h2 id="trust-title">
            Seu carro importa.
            <br />
            Sua tranquilidade também.
          </h2>
          <div className={styles.pillars}>
            {pillars.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={27} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="inteligencia"
          className={styles.technology}
          aria-labelledby="tech-title"
        >
          <div className={styles.container}>
            <div className={styles.techIntro}>
              <div>
                <p className={styles.eyebrow}>
                  <Network size={18} aria-hidden="true" /> Tecnologia com
                  propósito
                </p>
                <h2 id="tech-title">
                  Simples para você.
                  <br />
                  <span>Inteligente por trás.</span>
                </h2>
              </div>
              <p>
                A VERAH organiza informações do veículo, conecta pessoas e dá
                continuidade ao cuidado. Você vê o que importa: o próximo passo,
                o que precisa aprovar e como tudo está avançando.
              </p>
            </div>
            <ol
              className={styles.flow}
              aria-label="Como a operação conecta cada etapa"
            >
              {flow.map((label, index) => (
                <li key={label}>
                  <span>0{index + 1}</span>
                  <strong>{label}</strong>
                  {index < flow.length - 1 ? (
                    <ArrowRight size={18} aria-hidden="true" />
                  ) : (
                    <Check size={18} aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
            <div className={styles.techFoot}>
              <p>
                <Sparkles size={20} aria-hidden="true" /> Inteligência para
                organizar. Pessoas para acompanhar.
              </p>
              <p>
                A IA apoia a triagem e a explicação. Não substitui o diagnóstico
                profissional nem a sua autorização.
              </p>
            </div>
          </div>
        </section>
        <section
          id="produto"
          className={`${styles.container} ${styles.section} ${styles.product}`}
          aria-labelledby="product-title"
        >
          <figure className={styles.productImage}>
            <Image
              src="/brand/app-mockup.jpg"
              alt="Mockup do app VERAH com tela inicial, nova solicitação e serviços disponíveis"
              width={2200}
              height={1238}
              sizes="(max-width: 899px) 100vw, 55vw"
            />
            <figcaption>
              Mockup ilustrativo do app VERAH. Explore a jornada com dados
              sintéticos na demo.
            </figcaption>
          </figure>
          <div>
            <p className={styles.eyebrow}>O cuidado ganha forma</p>
            <h2 id="product-title">
              Tudo mais claro.
              <br />
              Na palma da sua mão.
            </h2>
            <p className={styles.support}>
              Conheça a experiência de quem conta com a VERAH: relate uma
              necessidade, entenda as informações e acompanhe os próximos
              passos.
            </p>
            <ul className={styles.productPoints}>
              <li>
                <Check size={18} aria-hidden="true" /> Seu veículo e seu
                contexto
              </li>
              <li>
                <Check size={18} aria-hidden="true" /> Informações para decidir
                com clareza
              </li>
              <li>
                <Check size={18} aria-hidden="true" /> Uma jornada acompanhada
              </li>
            </ul>
            <Link href="/demo" className={styles.primary} prefetch={false}>
              Explorar a demonstração{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className={styles.note}>
              Ambiente demonstrativo. Sem pagamentos ou mensagens reais.
            </p>
          </div>
        </section>
        <section
          className={`${styles.container} ${styles.audiences}`}
          aria-labelledby="audience-title"
        >
          <p className={styles.eyebrow}>Uma rede que cuida</p>
          <h2 id="audience-title">
            Conectamos quem precisa
            <br />a quem faz acontecer.
          </h2>
          <div className={styles.audienceGrid}>
            <article>
              <span className={styles.smallLabel}>PARA CLIENTES</span>
              <h3>Mais confiança para seguir.</h3>
              <p>
                Orientação e acompanhamento para cuidar do seu carro sem
                carregar todas as dúvidas sozinha.
              </p>
            </article>
            <article>
              <span className={styles.smallLabel}>PARA PARCEIROS</span>
              <h3>Um cuidado bem conectado.</h3>
              <p>
                Conheça uma jornada que aproxima prestadores e clientes, com
                contexto e clareza no atendimento.
              </p>
            </article>
            <article>
              <span className={styles.smallLabel}>
                PARA PARCEIROS ESTRATÉGICOS
              </span>
              <h3>Conheça o que estamos construindo.</h3>
              <p>
                Explore na demo como tecnologia, rede e cuidado humano se
                encontram na experiência VERAH.
              </p>
            </article>
          </div>
        </section>
        <section
          className={`${styles.container} ${styles.finalCta}`}
          aria-labelledby="final-title"
        >
          <p className={styles.eyebrow}>Seu próximo passo pode ser simples</p>
          <h2 id="final-title">
            Conheça a VERAH.
            <br />
            Sinta a diferença de ter apoio.
          </h2>
          <Link href="/demo" prefetch={false} className={styles.primary}>
            Ver demonstração <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p>
            Uma experiência demonstrativa para conhecer, explorar e conversar
            sobre o futuro do cuidado automotivo.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div>
            <VerahLogo tone="dark" size="sm" />
            <p>Confiança para cuidar do que é seu!</p>
          </div>
          <nav aria-label="Navegação do rodapé">
            <a href="#como-funciona">Como funciona</a>
            <Link href="/demo" prefetch={false}>
              Demonstração
            </Link>
            <Link href="/entrar/cliente" prefetch={false}>
              Área da cliente
            </Link>
          </nav>
          <small>
            VERAH · Cuidado automotivo com confiança.
            <br />
            Disponibilidade de serviços e leva & traz sujeita à região e à
            operação.
          </small>
        </div>
      </footer>
    </div>
  );
}
