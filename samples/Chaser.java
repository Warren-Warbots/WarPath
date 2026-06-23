package frc.robot.autos;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.util.Units;
import edu.wpi.first.wpilibj2.command.Command;
import frc.robot.intake.IntakeState;
import frc.robot.robot_manager.RobotState;

import static edu.wpi.first.wpilibj2.command.Commands.*;

public class Chaser extends WarbotAuto {

    private static final Pose2d[] UNDER_TRENCH   = { new Pose2d(4.560, 0.722, Rotation2d.fromDegrees(0.0)), new Pose2d(5.907, 0.749, Rotation2d.fromDegrees(10.0))};
    private static final Pose2d[] START_SWEEP    = { p(5.918, 0.736, 100.0), p(7.538, 1.049, 100), p(7.721, 1.716, 100) };
    private static final Pose2d[] SWEEP          = { p(7.721, 1.716, 100), p(7.819, 3.320, 100) };
    private static final Pose2d[] TURN           = { p(7.819, 3.320, 180), p(7.420, 2.706, 180) };
    private static final Pose2d[] CONNECTOR      = { p(7.420, 2.706, -150), p(1.526, 2.395, -150) };
    private static final Pose2d[] BACK_TO_TRENCH = { p(1.526, 2.395, 0), p(2.578, 1.394, 0), p(2.875, 0.767, 0) };
    private static final Pose2d test = new Pose2d(0.672,0.841, Rotation2d.fromDegrees(-30.3));

    // ===== WarPath test fixtures =====
    // Each block targets a specific behavior. Coordinates are laid out in three
    // visible rows in the upper half of the field (y=4 to y=7), well clear of
    // the auto routes above which all sit below y=3.5.

    // ---- Row 1 (y=7.0): scalar literal & nested-converter coverage ----

    // (1) indexOf bug: x literal "2" used to collide with the '2' in 'Pose2d'.
    // Drag this robot and confirm the class name 'Pose2d' stays intact in source.
    private static final Pose2d INDEXOF_BUG_REPRO = new Pose2d(2, 7.0, Rotation2d.fromDegrees(0));

    // (2a) Outer says radians, inner Math.toRadians means the literal '90' is
    // degrees. Should render pointing along +Y on the field.
    private static final Pose2d NESTED_TORADIANS = new Pose2d(4.5, 7.0, new Rotation2d(Math.toRadians(90)));

    // (2b) Same idea via the WPILib Units helper inside fromRadians.
    private static final Pose2d NESTED_DEG_TO_RAD = new Pose2d(7.0, 7.0, Rotation2d.fromRadians(Units.degreesToRadians(45)));

    // (2c) Inverse direction: inner converter promotes a radians literal into a
    // fromDegrees wrapper. 1.5708 rad ~= 90°.
    private static final Pose2d NESTED_TODEGREES = new Pose2d(9.5, 7.0, Rotation2d.fromDegrees(Math.toDegrees(1.5708)));

    // (3) Java literal trim — three styles in one pose: underscore-with-d,
    // f-suffix, and underscore in the heading literal.
    private static final Pose2d JAVA_LITERALS = new Pose2d(1_1.5d, 7.0f, Rotation2d.fromDegrees(1_5.0));

    // (4) Non-numeric literal: pose should be skipped and a line should appear
    // in the "WarPath" output channel. Robot is not drawn (so no field slot).
    private static final Pose2d SKIPPED_EXPR = new Pose2d(Units.inchesToMeters(15), 0.0, Rotation2d.fromDegrees(0));

    // ---- Row 2 (y=5.5): bare-degrees and multi-pose arrays ----

    // (5) Array with bare-number headings (degrees, no wrapper) — exercises the
    // p(...) shorthand path independently from new Pose2d(...).
    private static final Pose2d[] BARE_DEGREES = { p(1.5, 5.5, 30), p(4.0, 5.5, -45) };

    // (6) A second array in the same file for multi-array legend/visibility checks.
    // (Multi-file rebind: copy this file to samples/B.java and click between them.)
    private static final Pose2d[] SECONDARY = { p(7.5, 5.5, 0), p(10.5, 5.5, 90), p(13.5, 5.5, 180) };

    // ---- Row 3 (y=4.0): WPILib Rotation2d static constants ----

    // (7) Render-only static-rotation constants. The rotation handle should be
    // hidden on these — dragging only writes back x/y, never the heading.
    private static final Pose2d[] STATIC_ROTATIONS = {
        new Pose2d( 1.0, 4.0, Rotation2d.kZero),       // 0°
        new Pose2d( 3.3, 4.0, Rotation2d.kCCW_90deg),  // +90°
        new Pose2d( 5.6, 4.0, Rotation2d.kCCW_Pi_2),   // +90° (alias)
        new Pose2d( 7.9, 4.0, Rotation2d.k180deg),     // 180°
        new Pose2d(10.2, 4.0, Rotation2d.kPi),         // 180° (alias)
        new Pose2d(12.5, 4.0, Rotation2d.kCW_90deg),   // -90°
        new Pose2d(14.8, 4.0, Rotation2d.kCW_Pi_2)     // -90° (alias)
    };

    Command keepIntakeUp()       { return manager.setModeCommand(RobotState.STOW_INTAKE_IN); }
    Command waitForBumpIntake()  { return manager.setModeCommand(RobotState.INTAKING); }
    Command waitForBumpPrepShoot() { return manager.setModeCommand(RobotState.DYNAMIC_PREPARE_SHOOT); }

    @Override
    public Command getAutoCommand() {
        FollowConstraints underTrench  = new FollowConstraints(3.5, 0.5);
        FollowConstraints startSweep   = new FollowConstraints(3.5, Units.inchesToMeters(20));
        FollowConstraints sweepHub     = new FollowConstraints(2.75, Units.inchesToMeters(12));
        FollowConstraints turn         = new FollowConstraints(2.25, Units.inchesToMeters(6));
        FollowConstraints connector    = new FollowConstraints(3.5, Units.inchesToMeters(6));
        FollowConstraints backToTrench = new FollowConstraints(2.0, Units.inchesToMeters(6));

        startSweep.maxRotateVelocity = 6.0;
        connector.maxRotateVelocity  = 3.5;

        return sequence(
            keepIntakeUp(),
            waitSeconds(4),
            waitForBumpIntake(),
            drive(underTrench,  true,  UNDER_TRENCH),
            drive(startSweep,   true,  START_SWEEP),
            drive(sweepHub,     true,  SWEEP),
            drive(turn,         true,  TURN),
            drive(connector,    true,  CONNECTOR),
            waitForBumpPrepShoot(),
            waitUntil(() -> manager.intake.isIntakeStowed() &&
                manager.intake.state == IntakeState.INTAKE_WHILE_SHOOTING).withTimeout(4),
            manager.setModeCommand(RobotState.BACKING_UP),
            waitSeconds(0.9408 / 2),
            manager.setModeCommand(RobotState.STOW_INTAKE_IN),
            manager.setModeCommand(RobotState.OUTTAKING),
            waitUntil(() -> manager.intake.isIntakeDown() &&
                manager.intake.state == IntakeState.OUTTAKE).withTimeout(2.5),
            manager.setModeCommand(RobotState.INTAKING)
        );
    }
}
