import React from 'react';
import './Production.css';
import Engine from './Engine';
import twitchLogo from './twitchLogo.png';
import twitterLogo from './twitterLogo.png';
import {productionDisplay} from '../../package.json';

export default class Production extends React.Component {
  render() {
    return (
      <div className="production">
        <Engine />

        <div className="game-metadata">
          <h1>{productionDisplay.displayName}</h1>
          {productionDisplay.authorName && (
            <h3>
              by
              <br />
              {productionDisplay.authorURL ? (
                <a href={productionDisplay.authorURL}>{productionDisplay.authorName}</a>
              ) : (
                productionDisplay.authorName
              )}
              <br />
              {productionDisplay.authorTwitter && (
                <a href={`https://twitter.com/${productionDisplay.authorTwitter}`}>
                  <img src={twitterLogo} alt={`@${productionDisplay.authorTwitter} on Twitter`} />
                </a>
              )}
              {productionDisplay.authorTwitch && (
                <a href={`https://twitch.tv/${productionDisplay.authorTwitch}`}>
                  <img src={twitchLogo} alt={`${productionDisplay.authorTwitch} on Twitch`} />
                </a>
              )}
            </h3>
          )}
          <p>
            {productionDisplay.eventDescription && (
              <React.Fragment>
                {productionDisplay.eventDescription}
                <br />
              </React.Fragment>
            )}
            {productionDisplay.eventNamePre}
            {' '}
            <strong>{productionDisplay.eventNameBold}</strong>
            {' '}
            {productionDisplay.eventNamePost}
          </p>
          {productionDisplay.eventURL && (
            <p>
              <a href={productionDisplay.eventURL}>
                {productionDisplay.eventURL}
              </a>
            </p>
          )}
          <p>
            {productionDisplay.themeDescription && (
              <React.Fragment>
                {productionDisplay.themeDescription}
                <br />
              </React.Fragment>
            )}
            {productionDisplay.themePre}
            {' '}
            <em>{productionDisplay.themeItalic}</em>
            {' '}
            {productionDisplay.themePost}
          </p>
          {productionDisplay.repoURL && (
            <p>
              code at
              <br />
              <a className="url" href={productionDisplay.repoURL}>
                {productionDisplay.repoURL}
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }
}
