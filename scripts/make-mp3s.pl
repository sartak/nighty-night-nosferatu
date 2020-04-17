#!/usr/bin/env perl
use strict;
use warnings;

@ARGV == 1 or die "usage: ls *.mid | make-mp3.pl soundfonts/Setzers_SPC_Soundfont.sf2\n";
my $sf_file = shift;
die "soundfont file '$sf_file' doesn't exist" unless -e $sf_file;

(my $sf = $sf_file) =~ s/\.\w+$//;
$sf =~ s!.*/!!;

while (<>) {
  chomp;
  die "$_ doesn't exist" unless -e $_;
  my $mid = $_;
  my $wav = $_;
  $wav =~ s/\.mid$/-$sf.wav/;

  if (!-e $wav) {
    system(
      "fluidsynth",
      "-F", $wav,
      $sf_file,
      $mid,
    );
  }

  my $mp3 = $_;
  $mp3 =~ s/\.mid$/-$sf.mp3/;

  if (!-e $mp3) {
    system(
      "ffmpeg",
      "-i", $wav,
      $mp3,
    );
  }
}
