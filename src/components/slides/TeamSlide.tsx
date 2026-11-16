import type { FC } from 'react';
import type { BaseSlideProps } from '../../types/slide.types';
import SlideHeader from './SlideHeader';
import { useVideoOverlay, PlayButton } from '../VideoOverlay';
import './TeamSlide.css';

interface TeamMember {
  name: string;
  title: string;
  imageUrl?: string;
  landscapeImageUrl?: string;
}

interface TeamSlideProps extends BaseSlideProps {
  label?: string;
  title: string;
  subtitle?: string | string[];
  members: TeamMember[];
  teamPhoto?: string;
  videoUrl?: string;
  videoLabel?: string;
  /** Second line on the play button, such as the video's length. */
  videoSubtitle?: string;
}

function renderBio(para: string, index: number) {
  const colonIndex = para.indexOf(':');
  if (colonIndex === -1) {
    return <p key={index} className="animate-slide-up delay-100">{para}</p>;
  }
  return (
    <div key={index} className="team-slide__bio animate-slide-up delay-100">
      <span className="team-slide__bio-name">{para.slice(0, colonIndex)}</span>
      <span className="team-slide__bio-desc">{para.slice(colonIndex + 1).trim()}</span>
    </div>
  );
}

const TeamSlide: FC<TeamSlideProps> = ({
  orientation = 'landscape',
  label,
  title,
  subtitle,
  members,
  teamPhoto,
  videoUrl,
  videoLabel = 'Play founders video',
  videoSubtitle,
}) => {
  const displayMembers = members.slice(0, 2);
  const subtitleArray = Array.isArray(subtitle) ? subtitle : subtitle ? [subtitle] : [];
  const { overlay, openVideo } = useVideoOverlay(videoUrl || '');

  if (orientation === 'portrait') {
    // Bios ("Name: role") sit under the photo; general paragraphs follow the video button.
    const bios = subtitleArray.filter((paragraph) => paragraph.includes(':'));
    const general = subtitleArray.filter((paragraph) => !paragraph.includes(':'));
    return (
      <div className="team-slide team-slide--portrait">
        {videoUrl && overlay}
        <SlideHeader orientation={orientation} label={label} title={title} />

        {teamPhoto ? (
          <div className="team-slide__portrait-team-photo animate-fade-in delay-300">
            <img src={teamPhoto} alt="Team" className="team-slide__portrait-team-photo-img" />
          </div>
        ) : (
          <div className="team-slide__portrait-photos">
            {members.slice(0, 5).map((member, index) => (
              <div
                key={index}
                className="team-member-portrait__photo animate-fade-in"
                style={{ animationDelay: `${300 + index * 100}ms` }}
              >
                {member.imageUrl ? (
                  <img
                    src={member.imageUrl}
                    alt={member.name}
                    className="team-member-portrait__image"
                  />
                ) : (
                  <div className="team-member-portrait__placeholder" />
                )}
              </div>
            ))}
          </div>
        )}

        {bios.length > 0 && (
          <div className="team-slide__portrait-description">
            {bios.map(renderBio)}
          </div>
        )}

        {videoUrl && (
          <div className="team-slide__video-action animate-fade-in delay-500">
            <PlayButton label={videoLabel} subtitle={videoSubtitle} onClick={openVideo} portrait />
          </div>
        )}

        {general.length > 0 && (
          <div className="team-slide__portrait-description team-slide__portrait-general">
            {general.map(renderBio)}
          </div>
        )}
      </div>
    );
  }

  // Landscape layout
  return (
    <div className="team-slide team-slide--landscape">
      {videoUrl && overlay}
      {/* Column 1: Header + Description */}
      <div className="team-slide__info-column">
        <SlideHeader orientation={orientation} label={label} title={title} />

        {subtitleArray.length > 0 && (
          <div className="team-slide__description">
            {subtitleArray.map(renderBio)}
          </div>
        )}

        {videoUrl && (
          <div className="team-slide__video-action animate-fade-in delay-500">
            <PlayButton label={videoLabel} subtitle={videoSubtitle} onClick={openVideo} />
          </div>
        )}
      </div>

      {teamPhoto ? (
        <div className="team-slide__team-photo animate-fade-in delay-300">
          <img src={teamPhoto} alt="Team" className="team-slide__team-photo-img" />
        </div>
      ) : (
        <div className="team-slide__members-container">
          {displayMembers.map((member, index) => {
            const imageUrl = member.landscapeImageUrl || member.imageUrl;
            return (
              <div
                key={index}
                className={`team-slide__member-card team-slide__member-card--${index + 1} animate-fade-in`}
                style={{ animationDelay: `${300 + index * 100}ms` }}
              >
                <div className="team-member__image-container">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={member.name}
                      className="team-member__image"
                    />
                  ) : (
                    <div className="team-member__placeholder" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamSlide;